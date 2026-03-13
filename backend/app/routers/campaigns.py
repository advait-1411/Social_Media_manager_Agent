"""
Campaigns router – file-backed Campaign Generator feature.

Routes:
  POST /api/campaigns/generate         → AI generation + save JSON file
  GET  /api/campaigns/                 → list all campaigns (metadata)
  GET  /api/campaigns/{id}             → read full campaign JSON
  PATCH /api/campaigns/{id}            → update caption / hashtags in JSON
  DELETE /api/campaigns/{id}           → delete JSON file
  POST /api/campaigns/{id}/commit      → turn selected blueprints into Post rows
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import models
from ..schemas.campaigns import (
    CampaignFile,
    CampaignGenerationRequest,
    CampaignGenerationResponse,
    CampaignMeta,
    CampaignPatchRequest,
    CommitCampaignRequest,
    CommitCampaignResponse,
)
from ..services.ai_assistant import generate_campaigns_via_ai

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Directory setup ──────────────────────────────────────────────────────────
_ROUTER_DIR = os.path.dirname(__file__)                         # .../routers/
_APP_DIR    = os.path.dirname(_ROUTER_DIR)                      # .../app/
_BACKEND_DIR = os.path.dirname(_APP_DIR)                        # .../backend/
CAMPAIGNS_DIR = os.path.join(_BACKEND_DIR, "campaigns")
os.makedirs(CAMPAIGNS_DIR, exist_ok=True)

_VALID_PLATFORMS = {"instagram", "linkedin", "twitter"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _campaign_path(campaign_id: str) -> str:
    return os.path.join(CAMPAIGNS_DIR, f"{campaign_id}.json")


def _load_campaign(campaign_id: str) -> CampaignFile:
    path = _campaign_path(campaign_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")
    with open(path, "r", encoding="utf-8") as f:
        return CampaignFile(**json.load(f))


def _save_campaign(campaign: CampaignFile) -> str:
    path = _campaign_path(campaign.id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(campaign.dict(), f, indent=2, default=str)
    return path


def _resolve_channel_ids(platform: str, db: Session) -> List[int]:
    channels = (
        db.query(models.Channel)
        .filter(models.Channel.platform == platform, models.Channel.is_active == True)
        .all()
    )
    return [c.id for c in channels]


# ─── POST /generate ───────────────────────────────────────────────────────────

@router.post("/generate", response_model=CampaignGenerationResponse)
async def generate_campaigns(
    request: CampaignGenerationRequest,
    db: Session = Depends(get_db),
):
    """
    Generate campaign blueprints via AI, then persist each as a JSON file.
    """
    logger.info(
        f"[CAMPAIGNS] Generate request – prompt='{request.prompt[:60]}…', "
        f"platforms={request.platforms}, num_campaigns={request.num_campaigns}"
    )

    # Validate & fetch assets
    assets: List[models.Asset] = []
    if request.asset_ids:
        assets = db.query(models.Asset).filter(models.Asset.id.in_(request.asset_ids)).all()
        found_ids = {a.id for a in assets}
        missing = set(request.asset_ids) - found_ids
        if missing:
            raise HTTPException(status_code=404, detail=f"Asset IDs not found: {sorted(missing)}")

    if request.logo_id:
        logo = db.query(models.Asset).filter(models.Asset.id == request.logo_id).first()
        if not logo:
            raise HTTPException(status_code=404, detail=f"Logo asset ID {request.logo_id} not found.")
        if request.logo_id not in {a.id for a in assets}:
            assets.append(logo)

    # Call AI
    try:
        result = await generate_campaigns_via_ai(request, assets)
    except ValueError as exc:
        logger.error(f"[CAMPAIGNS] ✗ Failed to generate campaign: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"[CAMPAIGNS] ✗ Failed to generate campaign: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Campaign generation failed: {str(exc)}")

    # Persist each CampaignFile to disk
    now = datetime.now(timezone.utc)
    saved_campaigns: List[CampaignFile] = []

    for campaign in result.campaigns:
        campaign.created_at = now
        campaign.updated_at = now
        # Carry over context from request
        campaign.business_context = request.business_context
        campaign.guidelines = request.guidelines
        campaign.platforms = request.platforms

        try:
            path = _save_campaign(campaign)
            logger.info(f"[CAMPAIGNS] Saved campaign {campaign.id} to {path}")
        except Exception as exc:
            logger.error(f"[CAMPAIGNS] ✗ Failed to save campaign {campaign.id}: {exc}")
            raise HTTPException(status_code=500, detail=f"Failed to persist campaign: {exc}")

        saved_campaigns.append(campaign)

    logger.info(f"[CAMPAIGNS] Generated & saved {len(saved_campaigns)} campaign(s).")
    return CampaignGenerationResponse(campaigns=saved_campaigns)


# ─── GET / ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CampaignMeta])
def list_campaigns():
    """Return metadata for all saved campaign JSON files."""
    results: List[CampaignMeta] = []
    for fname in sorted(os.listdir(CAMPAIGNS_DIR), reverse=True):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(CAMPAIGNS_DIR, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            results.append(CampaignMeta(
                id=data["id"],
                title=data["title"],
                strategy=data["strategy"],
                created_at=data["created_at"],
                platforms=data.get("platforms", []),
                post_count=len(data.get("posts", [])),
            ))
        except Exception as exc:
            logger.warning(f"[CAMPAIGNS] Could not parse {fname}: {exc}")
    return results


# ─── GET /{id} ────────────────────────────────────────────────────────────────

@router.get("/{campaign_id}", response_model=CampaignFile)
def get_campaign(campaign_id: str):
    """Return full campaign (including all post blueprints)."""
    return _load_campaign(campaign_id)


# ─── PATCH /{id} ──────────────────────────────────────────────────────────────

@router.patch("/{campaign_id}", response_model=CampaignFile)
def update_campaign(campaign_id: str, body: CampaignPatchRequest):
    """Partially update a campaign JSON (title, strategy, or a specific post blueprint)."""
    campaign = _load_campaign(campaign_id)

    if body.title is not None:
        campaign.title = body.title
    if body.strategy is not None:
        campaign.strategy = body.strategy

    if body.update_post is not None:
        # Find and replace the matching post blueprint in-place
        updated = False
        for i, post in enumerate(campaign.posts):
            if post.blueprint_id == body.update_post.blueprint_id:
                campaign.posts[i] = body.update_post
                updated = True
                break
        if not updated:
            raise HTTPException(
                status_code=404,
                detail=f"blueprint_id '{body.update_post.blueprint_id}' not found in campaign."
            )

    campaign.updated_at = datetime.now(timezone.utc)
    try:
        path = _save_campaign(campaign)
        logger.info(f"[CAMPAIGNS] Updated campaign {campaign_id} → {path}")
    except Exception as exc:
        logger.error(f"[CAMPAIGNS] ✗ Failed to save campaign {campaign_id}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return campaign


# ─── DELETE /{id} ─────────────────────────────────────────────────────────────

@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: str):
    """Delete a campaign JSON file."""
    path = _campaign_path(campaign_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Campaign '{campaign_id}' not found.")
    os.remove(path)
    logger.info(f"[CAMPAIGNS] Deleted campaign {campaign_id} ({path})")
    return {"message": f"Campaign {campaign_id} deleted."}


# ─── POST /{id}/commit ────────────────────────────────────────────────────────

@router.post("/{campaign_id}/commit", response_model=CommitCampaignResponse)
def commit_campaign(
    campaign_id: str,
    body: CommitCampaignRequest,
    db: Session = Depends(get_db),
):
    """
    Convert the selected blueprint IDs into real Post rows (status=draft).
    Marks each blueprint as 'committed' in the JSON file.
    Publishing happens only via the existing /api/posts/{id}/publish pipeline.
    """
    logger.info(
        f"[CAMPAIGNS] Commit request – campaign_id={campaign_id!r}, "
        f"blueprint_ids={body.blueprint_ids}, default_status={body.default_status!r}"
    )

    if not body.blueprint_ids:
        raise HTTPException(status_code=400, detail="blueprint_ids must not be empty.")

    campaign = _load_campaign(campaign_id)

    bp_map = {p.blueprint_id: p for p in campaign.posts}

    missing = [bid for bid in body.blueprint_ids if bid not in bp_map]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"blueprint_ids not found in campaign: {missing}"
        )

    created_ids: List[int] = []

    for bid in body.blueprint_ids:
        bp = bp_map[bid]

        if bp.platform not in _VALID_PLATFORMS:
            logger.warning(f"[CAMPAIGNS] Skipping invalid platform '{bp.platform}'.")
            continue

        # Resolve media_assets: carousel (asset_ids) takes precedence over single (asset_id)
        if bp.asset_ids:
            media_assets = bp.asset_ids
            logger.info(f"[CAMPAIGNS] Blueprint '{bid}' has {len(media_assets)} assets (carousel).")
        elif bp.asset_id is not None:
            media_assets = [bp.asset_id]
        else:
            media_assets = []

        # Validate all referenced assets exist
        for aid in media_assets:
            if not db.query(models.Asset).filter(models.Asset.id == aid).first():
                raise HTTPException(
                    status_code=404,
                    detail=f"Asset ID {aid} in blueprint '{bid}' not found."
                )

        hashtags_line = " ".join(bp.hashtags) if bp.hashtags else ""
        full_content = bp.caption
        if hashtags_line:
            full_content = f"{bp.caption}\n\n{hashtags_line}"
        full_content = full_content[:3000]

        channel_ids = _resolve_channel_ids(bp.platform, db)
        if not channel_ids:
            logger.info(
                f"[CAMPAIGNS] No active channel for platform='{bp.platform}'; "
                "committing post with empty channels list."
            )

        db_post = models.Post(
            content=full_content,
            media_assets=media_assets,
            status=body.default_status,
            channels=channel_ids,
            platform_settings={
                "campaign_id": campaign_id,
                "blueprint_id": bid,
                "platform": bp.platform,
                "hashtags": bp.hashtags,
                "image_prompt": bp.image_prompt,
                "is_carousel": len(media_assets) > 1,
                # TODO: auto-trigger image generation for blueprints with image_prompt but no asset_id
            },
        )
        db.add(db_post)
        db.flush()
        created_ids.append(db_post.id)

        # Mark blueprint as committed inside the JSON
        for post in campaign.posts:
            if post.blueprint_id == bid:
                post.status = "committed"
                break

    db.commit()

    # Persist updated statuses back to JSON
    campaign.updated_at = datetime.now(timezone.utc)
    try:
        _save_campaign(campaign)
    except Exception as exc:
        logger.warning(f"[CAMPAIGNS] Could not update campaign JSON after commit: {exc}")

    logger.info(
        f"[CAMPAIGNS] Committed {len(created_ids)} post(s) from campaign {campaign_id} "
        f"to Post IDs {created_ids}"
    )

    return CommitCampaignResponse(
        created_post_ids=created_ids,
        message=f"Created {len(created_ids)} draft post(s) from campaign '{campaign.title}'.",
    )

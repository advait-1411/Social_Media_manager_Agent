"""
Drafts router – Draft Library feature.

Routes:
  GET    /api/drafts/              → list all drafts (metadata)
  GET    /api/drafts/{id}          → read full draft JSON
  POST   /api/drafts/              → create new draft template
  PATCH  /api/drafts/{id}          → update draft template
  DELETE /api/drafts/{id}          → delete draft JSON file
  POST   /api/drafts/{id}/commit   → create a Post row from a draft
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
from ..schemas.drafts import (
    DraftCommitResponse,
    DraftCreateRequest,
    DraftFile,
    DraftMeta,
    DraftUpdateRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── Directory setup ──────────────────────────────────────────────────────────
_ROUTER_DIR = os.path.dirname(__file__)
_APP_DIR    = os.path.dirname(_ROUTER_DIR)
_BACKEND_DIR = os.path.dirname(_APP_DIR)
DRAFTS_DIR = os.path.join(_BACKEND_DIR, "drafts")
os.makedirs(DRAFTS_DIR, exist_ok=True)

_VALID_PLATFORMS = {"instagram", "linkedin", "twitter"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _draft_path(draft_id: str) -> str:
    return os.path.join(DRAFTS_DIR, f"{draft_id}.json")


def _load_draft(draft_id: str) -> DraftFile:
    path = _draft_path(draft_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Draft '{draft_id}' not found.")
    with open(path, "r", encoding="utf-8") as f:
        return DraftFile(**json.load(f))


def _save_draft(draft: DraftFile) -> str:
    path = _draft_path(draft.id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(draft.dict(), f, indent=2, default=str)
    return path


def _resolve_channel_ids(platform: str, db: Session) -> List[int]:
    channels = (
        db.query(models.Channel)
        .filter(models.Channel.platform == platform, models.Channel.is_active == True)
        .all()
    )
    return [c.id for c in channels]


# ─── GET / ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[DraftMeta])
def list_drafts():
    """Return metadata for all saved draft JSON files, newest first."""
    results: List[DraftMeta] = []
    for fname in sorted(os.listdir(DRAFTS_DIR), reverse=True):
        if not fname.endswith(".json"):
            continue
        fpath = os.path.join(DRAFTS_DIR, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            results.append(DraftMeta(
                id=data["id"],
                caption=data["caption"],
                platforms=data.get("platforms", []),
                created_at=data["created_at"],
                updated_at=data["updated_at"],
                asset_count=len(data.get("asset_ids", [])),
            ))
        except Exception as exc:
            logger.warning(f"[DRAFTS] Could not parse {fname}: {exc}")
    return results


# ─── GET /{id} ────────────────────────────────────────────────────────────────

@router.get("/{draft_id}", response_model=DraftFile)
def get_draft(draft_id: str):
    """Return the full draft object (including all asset IDs and platforms)."""
    return _load_draft(draft_id)


# ─── POST / ───────────────────────────────────────────────────────────────────

@router.post("/", response_model=DraftFile)
def create_draft(body: DraftCreateRequest, db: Session = Depends(get_db)):
    """Create a new draft template and save it as a JSON file."""
    # Validate platforms
    bad = [p for p in body.platforms if p not in _VALID_PLATFORMS]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unsupported platforms: {bad}")

    # Validate asset IDs
    if body.asset_ids:
        found = db.query(models.Asset).filter(models.Asset.id.in_(body.asset_ids)).all()
        found_ids = {a.id for a in found}
        missing = set(body.asset_ids) - found_ids
        if missing:
            raise HTTPException(status_code=404, detail=f"Asset IDs not found: {sorted(missing)}")

    now = datetime.now(timezone.utc)
    draft = DraftFile(
        caption=body.caption,
        asset_ids=body.asset_ids,
        platforms=body.platforms,
        created_at=now,
        updated_at=now,
        source=body.source or "manual",
    )

    try:
        path = _save_draft(draft)
        logger.info(f"[DRAFTS] Saved draft {draft.id} to {path}")
    except Exception as exc:
        logger.error(f"[DRAFTS] ✗ Error saving draft: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to save draft: {exc}")

    return draft


# ─── PATCH /{id} ──────────────────────────────────────────────────────────────

@router.patch("/{draft_id}", response_model=DraftFile)
def update_draft(draft_id: str, body: DraftUpdateRequest, db: Session = Depends(get_db)):
    """Partially update a draft template."""
    draft = _load_draft(draft_id)

    if body.caption is not None:
        draft.caption = body.caption
    if body.platforms is not None:
        bad = [p for p in body.platforms if p not in _VALID_PLATFORMS]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unsupported platforms: {bad}")
        draft.platforms = body.platforms
    if body.asset_ids is not None:
        if body.asset_ids:
            found = db.query(models.Asset).filter(models.Asset.id.in_(body.asset_ids)).all()
            found_ids = {a.id for a in found}
            missing = set(body.asset_ids) - found_ids
            if missing:
                raise HTTPException(status_code=404, detail=f"Asset IDs not found: {sorted(missing)}")
        draft.asset_ids = body.asset_ids

    draft.updated_at = datetime.now(timezone.utc)

    try:
        path = _save_draft(draft)
        logger.info(f"[DRAFTS] Updated draft {draft_id} → {path}")
    except Exception as exc:
        logger.error(f"[DRAFTS] ✗ Error saving draft: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return draft


# ─── DELETE /{id} ─────────────────────────────────────────────────────────────

@router.delete("/{draft_id}")
def delete_draft(draft_id: str):
    """Delete a draft template JSON file."""
    path = _draft_path(draft_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail=f"Draft '{draft_id}' not found.")
    os.remove(path)
    logger.info(f"[DRAFTS] Deleted draft {draft_id} ({path})")
    return {"message": f"Draft {draft_id} deleted."}


# ─── POST /{id}/commit ────────────────────────────────────────────────────────

@router.post("/{draft_id}/commit", response_model=DraftCommitResponse)
def commit_draft(draft_id: str, db: Session = Depends(get_db)):
    """
    Promote a draft template into a real Post row (status='draft').
    Publishing is handled by the existing /api/posts/{id}/publish pipeline.
    """
    draft = _load_draft(draft_id)

    # Resolve channel IDs per platform
    channel_ids: List[int] = []
    for platform in draft.platforms:
        channel_ids.extend(_resolve_channel_ids(platform, db))
    channel_ids = list(set(channel_ids))  # deduplicate

    if not channel_ids:
        logger.info(
            f"[DRAFTS] No active channels found for platforms {draft.platforms}; "
            "committing post with empty channels list."
        )

    db_post = models.Post(
        content=draft.caption,
        media_assets=draft.asset_ids,
        status="draft",
        channels=channel_ids,
        platform_settings={
            "draft_id": draft_id,
            "source": draft.source,
            "platforms": draft.platforms,
        },
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    logger.info(f"[DRAFTS] Promoted draft {draft_id} to Post ID {db_post.id}")

    return DraftCommitResponse(
        post_id=db_post.id,
        message=f"Draft promoted to Post ID {db_post.id} (status: draft).",
    )

"""
publish_job_builder.py – constructs a PublishJob from a VelvetQueue Post.

Handles:
  - Channel/credential resolution (mirrors publish_post_now logic)
  - Asset ID → public URL conversion (reuses _resolve_public_url)
  - Post type detection (image / carousel / reel)
  - Hashtag and metadata extraction from platform_settings
"""

import os
import uuid
import logging
from datetime import timezone
from sqlalchemy.orm import Session

from ..models import models
from ..schemas.publish_job import PublishJob

logger = logging.getLogger(__name__)


def _resolve_instagram_channel_id(db: Session, post: models.Post) -> str:
    """
    Return the Instagram user/account ID for this post.

    Priority order (mirrors publish_post_now):
    1. INSTAGRAM_USER_ID from .env
    2. Channel.credentials["user_id"] from the first active Instagram Channel
       that is listed in post.channels (or any active IG channel as fallback).

    Raises:
        ValueError: If no Instagram user ID can be resolved.
    """
    env_user_id = os.getenv("INSTAGRAM_USER_ID", "").strip().strip('"').strip("'")
    if env_user_id:
        logger.debug(f"[BUILDER] Resolved instagram_user_id from .env: {env_user_id}")
        return env_user_id

    # Look for an active Instagram Channel referenced by this post
    channel: models.Channel | None = None
    if post.channels:
        channel = (
            db.query(models.Channel)
            .filter(
                models.Channel.id.in_(post.channels),
                models.Channel.platform == "instagram",
                models.Channel.is_active == True,
            )
            .first()
        )

    # Broader fallback: any active Instagram channel
    if channel is None:
        channel = (
            db.query(models.Channel)
            .filter(
                models.Channel.platform == "instagram",
                models.Channel.is_active == True,
            )
            .first()
        )

    if channel and channel.credentials:
        user_id = channel.credentials.get("user_id", "")
        if user_id:
            logger.debug(f"[BUILDER] Resolved instagram_user_id from Channel {channel.id}")
            return str(user_id)

    raise ValueError(
        "Cannot resolve Instagram user ID: set INSTAGRAM_USER_ID in .env "
        "or configure an active Instagram channel with credentials."
    )


def _resolve_asset_urls(db: Session, post: models.Post) -> list[str]:
    """
    Resolve each asset ID in post.media_assets to a publicly accessible URL.
    Reuses the _resolve_public_url helper from scheduler.py.
    """
    from .scheduler import _resolve_public_url  # avoid circular imports at module level

    urls: list[str] = []
    for asset_id in post.media_assets:
        asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
        if not asset:
            raise ValueError(f"Asset {asset_id} not found in database")
        public_url = _resolve_public_url(asset.file_path)
        urls.append(public_url)
        logger.debug(f"[BUILDER] Resolved asset {asset_id} → {public_url[:80]}")
    return urls


def build_publish_job_from_post(db: Session, post: models.Post) -> PublishJob:
    """
    Build a PublishJob payload from a VelvetQueue Post.

    This is the single place that converts internal DB state into the
    platform-agnostic publish contract consumed by the external agent.
    """
    platform_settings: dict = post.platform_settings or {}

    # 1. Resolve Instagram channel ID
    instagram_channel_id = _resolve_instagram_channel_id(db, post)
    channels = {"instagram_channel_id": instagram_channel_id}

    # 2. Resolve asset URLs (and inspect asset types for carousel support)
    media_urls = _resolve_asset_urls(db, post)

    # Look up asset types so we can distinguish true image carousels from
    # mixed-media posts (which we currently do NOT send to Composio).
    asset_type_by_id: dict[int, str] = {}
    if post.media_assets:
        assets = (
            db.query(models.Asset)
            .filter(models.Asset.id.in_(post.media_assets))
            .all()
        )
        asset_type_by_id = {a.id: (a.asset_type or "image") for a in assets}

    all_images = True
    for aid in post.media_assets or []:
        a_type = asset_type_by_id.get(aid, "image")
        if a_type != "image":
            all_images = False
            logger.warning(
                "[BUILDER] Post %s has non-image asset_id=%s (type=%s); "
                "Composio carousel path will be skipped.",
                post.id,
                aid,
                a_type,
            )
            break

    # 3. Determine post type
    if platform_settings.get("is_reel"):
        post_type = "reel"
    elif len(media_urls) > 1 and all_images:
        # Pure image multi-asset post → eligible carousel
        post_type = "carousel"
    else:
        # Everything else is treated as a single-image style job for the
        # purposes of Composio routing; mixed-media will fall back to the
        # internal Graph API path.
        post_type = "image"

    # 4. Caption & hashtags
    caption = post.content or ""
    raw_hashtags = platform_settings.get("hashtags")
    hashtags: list[str] = raw_hashtags if isinstance(raw_hashtags, list) else []

    # 5. Metadata (traceability back to campaign/blueprint)
    metadata: dict[str, str | None] = {}
    if platform_settings.get("campaign_id"):
        metadata["campaign_id"] = str(platform_settings["campaign_id"])
    if platform_settings.get("blueprint_id"):
        metadata["blueprint_id"] = str(platform_settings["blueprint_id"])

    # 6. Scheduled time (UTC ISO string)
    scheduled_time_utc: str | None = None
    if post.scheduled_time is not None:
        scheduled_time_utc = post.scheduled_time.astimezone(timezone.utc).isoformat()

    job = PublishJob(
        job_id=str(uuid.uuid4()),
        post_id=post.id,
        platform="instagram",
        type=post_type,
        media_assets=media_urls,
        caption=caption,
        hashtags=hashtags,
        scheduled_time_utc=scheduled_time_utc,
        channels=channels,
        metadata=metadata,
    )

    logger.info(
        f"[BUILDER] Built PublishJob {job.job_id} for post {post.id} "
        f"(type={post_type}, assets={len(media_urls)})"
    )
    return job

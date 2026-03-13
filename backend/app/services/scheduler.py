import asyncio
import logging
import os
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import models
from typing import Optional, Tuple, List

logger = logging.getLogger(__name__)

# Global flag to track if scheduler is running
_scheduler_task: Optional[asyncio.Task] = None


async def scheduler_loop(interval_seconds: int = 30):
    """
    Background task that periodically checks for scheduled posts and publishes them.
    
    Args:
        interval_seconds: How often to check for due posts (default: 30 seconds)
    """
    logger.info(f"[SCHEDULER] Starting scheduler loop (interval: {interval_seconds}s)")
    
    while True:
        try:
            # Sleep first to prevent tight loop on error
            await asyncio.sleep(interval_seconds)
            
            # Open a new DB session for this iteration
            db = SessionLocal()
            try:
                # Use UTC for all time comparisons
                now = datetime.now(timezone.utc)
                logger.info(f"[SCHEDULER] Tick at {now.isoformat()}")
                
                # Find posts that are scheduled and due
                # Filter strict: status IS scheduled AND time IS NOT NULL AND time <= now
                # We also check for 'approved' status if auto-schedule didn't happen correctly,
                # but STRICTLY relying on 'scheduled' is safer. 
                # Per diagnosis, let's stick to 'scheduled' to avoid accidental publishing of un-scheduled work.
                # However, previous code allowed 'approved' too. Let's keep it safe:
                # Only publish if it has a TIME set.
                due_posts = db.query(models.Post).filter(
                    (models.Post.status == "scheduled") | (models.Post.status == "approved"),
                    models.Post.scheduled_time.isnot(None),
                    models.Post.scheduled_time <= now
                ).all()
                
                if due_posts:
                    logger.info(f"[SCHEDULER] Found {len(due_posts)} due post(s)")
                
                for post in due_posts:
                    logger.info(f"[SCHEDULER] Processing post id={post.id}")
                    
                    try:
                        # Mark as publishing immediately to prevent double-processing
                        post.status = "publishing"
                        post.last_publish_attempt_at = now
                        post.last_error = None
                        db.commit()
                        
                        # Publish the post
                        publish_post_now(db, post)
                        
                        # Success handling is done inside publish_post_now (updates to 'published')
                        # CLASH HANDLING NOTE:
                        # Posts are processed sequentially in this loop. Even if multiple posts are scheduled
                        # for the exact same time, they picked up in one batch and processed one by one.
                        # The 'already published' guard in publish_post_now() prevents double-publishing 
                        # if the scheduler restarts or if multiple ticks overlap (though single-instance lock prevents that).
                        logger.info(f"[SCHEDULER] ✓ Successfully processed post id={post.id}")

                        # Create success notification
                        notification = models.Notification(
                            post_id=post.id,
                            title="Post Published",
                            message=f"Your post \"{post.content[:20]}...\" has been published successfully.",
                            type="success"
                        )
                        db.add(notification)
                        db.commit()

                    except Exception as e:
                        # Catch per-post exceptions so one failure doesn't stop others
                        # Logic: If publish_post_now failed, it should have already set status='failed'.
                        # But if the commit inside it failed or something else happened, we ensure it here.
                        error_msg = str(e)[:1000]
                        logger.error(f"[SCHEDULER] ✗ Failed post id={post.id}: {error_msg}")
                        
                        # Update DB with failure if not already caught inside helper
                        try:
                            # Re-fetch or refresh to be safe? 
                            # Usually helper failure rolls back or commits 'failed'. 
                            # If we are here, exception bubbled up.
                            if post.status != "failed" and post.status != "published":
                                post.status = "failed"
                                post.last_error = error_msg
                                
                                # Create failure notification
                                notification = models.Notification(
                                    post_id=post.id,
                                    title="Publishing Failed",
                                    message=f"Failed to publish post: {error_msg}",
                                    type="error"
                                )
                                db.add(notification)
                                db.commit()
                        except Exception as db_exc:
                            logger.error(f"[SCHEDULER] Critical DB error updating post {post.id}: {db_exc}")
                            # If DB is broken, try rollback
                            db.rollback()

            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"[SCHEDULER] Unhandled error in scheduler loop: {str(e)}", exc_info=True)
            # Sleep a bit longer if we hit a loop-level crash to avoid log spam
            await asyncio.sleep(5)


def _resolve_public_url(file_path: str) -> str:
    """
    Convert a local file_path into a publicly accessible URL.
    Prefers PUBLIC_BASE_URL env var; falls back to freeimage.host upload.
    """
    if file_path.startswith("http://") or file_path.startswith("https://"):
        return file_path

    clean_path = file_path.lstrip('./').lstrip('/')
    base_url = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
    image_url = f"{base_url}/{clean_path}"

    if "localhost" in image_url or "127.0.0.1" in image_url:
        public_base = os.getenv("PUBLIC_BASE_URL")
        if (
            public_base
            and not public_base.startswith("http://localhost")
            and not public_base.startswith("http://127.0.0.1")
        ):
            image_url = image_url.replace("http://localhost:8000", public_base)
            image_url = image_url.replace("http://127.0.0.1:8000", public_base)
            return image_url

        # Upload to Freeimage.host
        logger.info(f"[PUBLISH] Uploading image to hosting service: {file_path}")
        abs_path = os.path.abspath(file_path)
        if not os.path.exists(abs_path):
            raise Exception(f"Image file not found: {abs_path}")

        freeimage_api_key = os.getenv("FREEIMAGE_HOST_API_KEY", "6d207e02198a847aa98d0a27a")
        upload_url = "https://freeimage.host/api/1/upload"

        with open(abs_path, 'rb') as image_file:
            files = {'source': image_file}
            data = {'key': freeimage_api_key, 'format': 'json'}
            response = requests.post(upload_url, files=files, data=data, timeout=60)
            response.raise_for_status()
            result = response.json()

        if result.get('status_code') == 200:
            public_url = result.get('image', {}).get('url')
            if public_url:
                logger.info(f"[PUBLISH] ✓ Image uploaded: {public_url}")
                return public_url
            raise Exception("Hosting service did not return a URL")
        else:
            error_msg = (
                result.get('error', {}).get('message', 'Unknown error')
                if isinstance(result.get('error'), dict)
                else str(result)
            )
            raise Exception(f"Failed to upload image: {error_msg}")

    return image_url


def _build_composio_payload_for_post(db: Session, post: models.Post) -> Tuple[str, str]:
    """
    Returns (image_url, caption) for the given Post, for Composio posting.

    - image_url: resolved from the first media asset.
    - caption: post.content (+ hashtags if present in platform_settings).
    """
    # 1) Resolve primary image asset
    if not post.media_assets:
        raise ValueError(f"Post {post.id} has no media_assets")

    primary_asset_id = post.media_assets[0]  # Composio: first asset only

    asset = db.query(models.Asset).filter(models.Asset.id == primary_asset_id).first()
    if not asset:
        raise ValueError(f"Asset {primary_asset_id} not found for Post {post.id}")

    image_url = _resolve_public_url(asset.file_path)

    # 2) Build caption with hashtags
    content = post.content or ""
    hashtags: List[str] = []

    ps = post.platform_settings or {}
    raw_hashtags = ps.get("hashtags")
    if isinstance(raw_hashtags, list):
        hashtags = [str(h) for h in raw_hashtags if h]

    caption = content
    if hashtags:
        caption = f"{content}\n\n" if content else ""
        caption += " ".join(hashtags)

    return image_url, caption


def publish_post_now(db: Session, post: models.Post):
    """
    Publish a post immediately via Instagram.

    Flow:
      1. Idempotency guard – skip if already published.
      2. Build a PublishJob from the post.
      3. Try to send it to the configured external agent (INSTAGRAM_AGENT_ENDPOINT).
         On success → update Post and return.
      4. On AgentPublishError (or agent did not report "published") → fall back to
         the internal instagram_publishing.py logic (legacy path).

    Used by both the scheduler and the manual /api/posts/{id}/publish endpoint.
    """
    from .instagram_publishing import post_to_instagram, post_carousel_to_instagram
    from .publish_job_builder import build_publish_job_from_post
    from .composio_instagram import (
        post_image_via_composio,
        post_carousel_via_composio,
        ComposioError,
    )
    from ..schemas.composio_instagram import ComposioPostRequest

    logger.info(f"[PUBLISH] Starting publish for post ID: {post.id}")
    now = datetime.now(timezone.utc)

    # ── 1. IDEMPOTENCY CHECK ─────────────────────────────────────────────────
    if post.status == "published":
        media_id = (post.platform_settings or {}).get("instagram_media_id")
        if media_id:
            logger.warning(
                f"[PUBLISH] Post {post.id} already published (media_id={media_id}), skipping"
            )
            return media_id

    # ── 2. VALIDATE ASSETS ───────────────────────────────────────────────────
    if not post.media_assets:
        raise Exception("Post has no media assets")

    # ── 3. BUILD PUBLISH JOB ─────────────────────────────────────────────────
    try:
        job = build_publish_job_from_post(db, post)
    except Exception as builder_exc:
        logger.error(f"[PUBLISH] Failed to build PublishJob for post {post.id}: {builder_exc}")
        # Re-raise – we cannot publish without at least knowing the assets/channel
        raise

    # Mark as publishing before any external call
    post.status = "publishing"
    post.last_publish_attempt_at = now
    post.last_error = None
    db.commit()
    db.refresh(post)

    # ── 4. TRY COMPOSIO PATH (Primary for Instagram) ──────────────────────────
    if job.platform == "instagram":
        try:
            comp_result = None

            # Single-image path (existing behavior)
            if job.type == "image" and len(job.media_assets) == 1:
                logger.info(
                    "[PUBLISH] Targeting Composio primary path (single image) for post %s",
                    post.id,
                )

                # Build (image_url, caption) via the dedicated helper which
                # resolves the first asset URL and appends hashtags to caption.
                image_url, caption = _build_composio_payload_for_post(db, post)

                comp_req = ComposioPostRequest(
                    image_url=image_url,
                    caption=caption,
                )

                # Execute the two-step Composio flow
                comp_result = post_image_via_composio(comp_req)

            # New: carousel path via Composio when all assets are images
            elif job.type == "carousel" and len(job.media_assets) >= 2:
                # Guardrail: double-check that all referenced assets are images.
                non_image_found = False
                for aid in post.media_assets or []:
                    asset = (
                        db.query(models.Asset)
                        .filter(models.Asset.id == aid)
                        .first()
                    )
                    if not asset or (asset.asset_type or "image") != "image":
                        non_image_found = True
                        logger.warning(
                            "[PUBLISH] Post %s has non-image asset_id=%s (type=%s); "
                            "skipping Composio carousel path and using internal IG.",
                            post.id,
                            aid,
                            getattr(asset, "asset_type", None),
                        )
                        break

                if not non_image_found:
                    logger.info(
                        "[PUBLISH] Targeting Composio carousel path for post %s "
                        "(assets=%d)",
                        post.id,
                        len(job.media_assets),
                    )
                    comp_result = post_carousel_via_composio(job)
                else:
                    comp_result = None

            else:
                logger.info(
                    "[PUBLISH] Post %s is type=%s (assets=%d). "
                    "Skipping Composio → internal fallback.",
                    post.id,
                    job.type,
                    len(job.media_assets),
                )

            # Handle successful Composio result (single image or carousel)
            if comp_result and comp_result.get("status") == "published":
                ps = post.platform_settings or {}

                publish_raw = comp_result.get("publish_raw", {})
                media_id = (
                    comp_result.get("instagram_media_id")
                    or comp_result.get("creation_id")
                )
                if media_id:
                    ps["instagram_media_id"] = media_id

                # Try to extract permalink from the raw publish response if present
                permalink = comp_result.get("permalink")
                if not permalink and isinstance(publish_raw, dict):
                    result_obj = publish_raw.get("result", {})
                    if isinstance(result_obj, dict):
                        permalink = (
                            result_obj.get("permalink")
                            or result_obj.get("permalink_url")
                        )
                if permalink:
                    ps["permalink"] = permalink

                post.platform_settings = ps
                post.status = "published"
                post.last_error = None
                db.commit()
                db.refresh(post)
                logger.info(
                    "[PUBLISH] ✓ Post %s published via Composio (media_id=%s, type=%s)",
                    post.id,
                    media_id,
                    job.type,
                )
                return media_id

            if comp_result and comp_result.get("status") != "published":
                logger.warning(
                    "[COMPOSIO] ✗ Post %s returned status=%r. Falling back to internal IG.",
                    post.id,
                    comp_result.get("status"),
                )

        except (ComposioError, ValueError) as comp_err:
            logger.error(
                "[COMPOSIO] ✗ Failed to publish post %s via Composio: %s. "
                "Falling back to internal IG.",
                post.id,
                comp_err,
            )
            # Do NOT return; continue into fallback logic below
        except Exception as exc:
            logger.error(
                "[COMPOSIO] ✗ Unexpected error publishing post %s via Composio: %s. "
                "Falling back to internal IG.",
                post.id,
                exc,
            )
            # Do NOT return; continue into fallback logic below

    # ── 5. FALLBACK – INTERNAL instagram_publishing.py ───────────────────────
    logger.info(f"[PUBLISH] Using internal Instagram publisher fallback for post {post.id}")

    try:
        # Resolve credentials (same priority as before: .env > Channel.credentials)
        channel = db.query(models.Channel).filter(models.Channel.platform == "instagram").first()

        env_user_id = os.getenv("INSTAGRAM_USER_ID")
        env_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")

        user_id = None
        token = None

        if env_user_id and env_token:
            user_id = env_user_id.strip().strip('"').strip("'")
            token = env_token.strip().strip('"').strip("'")
            logger.info(f"[PUBLISH] Using credentials from .env file")

            if channel:
                channel.credentials = {"user_id": user_id, "access_token": token}
            else:
                channel = models.Channel(
                    platform="instagram",
                    name="Default Account",
                    credentials={"user_id": user_id, "access_token": token},
                )
                db.add(channel)
            db.commit()

        elif channel and channel.credentials:
            creds = channel.credentials
            user_id = creds.get("user_id")
            token = creds.get("access_token")
            logger.info(f"[PUBLISH] Using credentials from database")

        else:
            raise Exception(
                "No Instagram credentials found. "
                "Set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env."
            )

        if not user_id or not token:
            raise Exception("Invalid channel credentials (user_id or token missing)")

        # Reuse the already-resolved URLs from the PublishJob
        image_urls: list[str] = job.media_assets

        if len(image_urls) == 1:
            logger.info(f"[PUBLISH] Posting single image to Instagram...")
            media_id = post_to_instagram(image_urls[0], post.content or "", user_id, token)
        else:
            logger.info(
                f"[PUBLISH] Creating carousel with {len(image_urls)} items for post {post.id}"
            )
            media_id = post_carousel_to_instagram(
                image_urls, post.content or "", user_id, token
            )

        # SUCCESS
        ps = post.platform_settings or {}
        ps["instagram_media_id"] = media_id
        post.platform_settings = ps
        post.status = "published"
        post.last_publish_attempt_at = now
        post.last_error = None
        db.commit()

        logger.info(f"[PUBLISH] ✓ Post {post.id} published via internal IG (media_id={media_id})")
        return media_id

    except Exception as e:
        error_msg = str(e)[:1000]
        logger.error(f"[PUBLISH] ✗ Failed to publish post {post.id}: {error_msg}")

        if post.status != "published":
            post.status = "failed"
            post.last_publish_attempt_at = now
            post.last_error = error_msg
            try:
                db.commit()
            except Exception:
                db.rollback()

        raise  # Re-raise so scheduler / manual endpoint can handle it


def start_scheduler(app, interval_seconds: Optional[int] = None):
    """
    Start the background scheduler task.
    
    Args:
        app: FastAPI application instance
        interval_seconds: How often to check for due posts (overrides env var if provided)
    """
    global _scheduler_task
    
    # Check if scheduler is enabled
    enabled_str = os.getenv("SCHEDULER_ENABLED", "true").lower()
    enabled = enabled_str in ["true", "1", "yes"]
    
    if not enabled:
        logger.info("[SCHEDULER] Disabled via SCHEDULER_ENABLED env")
        return
    
    # Check if already running
    if _scheduler_task is not None and not _scheduler_task.done():
        logger.warning("[SCHEDULER] Already running, skipping start")
        return
    
    # Get interval from env if not provided
    if interval_seconds is None:
        interval_seconds = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "30"))
    
    logger.info(f"[SCHEDULER] Starting scheduler with interval: {interval_seconds}s")
    _scheduler_task = asyncio.create_task(scheduler_loop(interval_seconds))

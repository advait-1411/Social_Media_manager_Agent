import asyncio
import logging
import os
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import models
from typing import Optional

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


def publish_post_now(db: Session, post: models.Post) -> str:
    """
    Publish a post immediately using the existing Instagram publishing logic.
    
    This is a shared helper used by both the scheduler and the manual publish endpoint.
    It handles:
    1. Idempotency (already published check)
    2. Credential resolution (.env > DB)
    3. Image hosting (localhost -> freeimage.host)
    4. Instagram API calls
    5. Success/Failure status updates
    
    Returns:
        str: Instagram media_id
        
    Raises:
        Exception: If publishing fails (updates post status to failed before raising)
    """
    from .instagram_publishing import post_to_instagram
    
    logger.info(f"[PUBLISH] Starting publish for post ID: {post.id}")
    now = datetime.now(timezone.utc)
    
    # 1. IDEMPOTENCY CHECK
    if post.status == "published":
         media_id = post.platform_settings.get("instagram_media_id")
         if media_id:
             logger.warning(f"[PUBLISH] Post {post.id} already published (media_id={media_id}), skipping")
             return media_id
    
    try:
        # 2. RESOLVE CREDENTIALS
        channel = db.query(models.Channel).filter(models.Channel.platform == "instagram").first()
        
        env_user_id = os.getenv("INSTAGRAM_USER_ID")
        env_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
        
        user_id = None
        token = None
        
        if env_user_id and env_token:
            # Use .env credentials
            user_id = env_user_id.strip().strip('"').strip("'")
            token = env_token.strip().strip('"').strip("'")
            logger.info(f"[PUBLISH] Using credentials from .env file")
            
            # Sync to DB for consistency
            if channel:
                channel.credentials = {"user_id": user_id, "access_token": token}
            else:
                channel = models.Channel(
                    platform="instagram",
                    name="Default Account",
                    credentials={"user_id": user_id, "access_token": token}
                )
                db.add(channel)
            db.commit()
            
        elif channel and channel.credentials:
            # Fall back to database
            creds = channel.credentials
            user_id = creds.get("user_id")
            token = creds.get("access_token")
            logger.info(f"[PUBLISH] Using credentials from database")
            
        else:
            raise Exception("No Instagram credentials found. Please set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env file.")
        
        if not user_id or not token:
            raise Exception("Invalid channel credentials (user_id or token missing)")
        
        # 3. PREPARE ASSET
        if not post.media_assets:
            raise Exception("Post has no media assets")
        
        asset_id = post.media_assets[0]
        asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
        if not asset:
            raise Exception(f"Asset {asset_id} not found")
        
        file_path = asset.file_path
        
        # Determine URL
        if file_path.startswith("http://") or file_path.startswith("https://"):
            image_url = file_path
        else:
            # Local file
            clean_path = file_path.lstrip('./').lstrip('/')
            base_url = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
            image_url = f"{base_url}/{clean_path}"
        
        # Handle localhost/private IP
        if "localhost" in image_url or "127.0.0.1" in image_url:
            public_base = os.getenv("PUBLIC_BASE_URL")
            if public_base and not public_base.startswith("http://localhost") and not public_base.startswith("http://127.0.0.1"):
                # Use configured public base URL
                image_url = image_url.replace("http://localhost:8000", public_base)
                image_url = image_url.replace("http://127.0.0.1:8000", public_base)
            else:
                # Upload to Freeimage.host
                logger.info(f"[PUBLISH] Uploading image to hosting service...")
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
                        image_info = result.get('image', {})
                        public_url = image_info.get('url')
                        if public_url:
                            image_url = public_url
                            logger.info(f"[PUBLISH] ✓ Image uploaded successfully: {image_url}")
                        else:
                            raise Exception("Hosting service did not return a URL")
                    else:
                        error_msg = result.get('error', {}).get('message', 'Unknown error') if isinstance(result.get('error'), dict) else str(result)
                        raise Exception(f"Failed to upload image: {error_msg}")
        
        # 4. PUBLISH TO INSTAGRAM
        logger.info(f"[PUBLISH] Posting to Instagram...")
        media_id = post_to_instagram(image_url, post.content or "", user_id, token)
        
        # 5. SUCCESS: UPDATE POST
        post.status = "published"
        # Merge new settings safely
        current_settings = post.platform_settings or {}
        post.platform_settings = {**current_settings, "instagram_media_id": media_id}
        
        post.last_publish_attempt_at = now
        post.last_error = None
        db.commit()
        
        logger.info(f"[PUBLISH] ✓ Post published successfully, media ID: {media_id}")
        return media_id
        
    except Exception as e:
        # FAILURE: UPDATE POST
        error_msg = str(e)[:1000]
        logger.error(f"[PUBLISH] ✗ Failed to publish post: {error_msg}")
        
        # Only update status to failed if we aren't already published (race condition check)
        if post.status != "published":
            post.status = "failed"
            post.last_publish_attempt_at = now
            post.last_error = error_msg
            try:
                db.commit()
            except:
                db.rollback()
        
        raise  # Re-raise so caller knows it failed


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

"""
Profile Router
Handles profile overview and post listing per platform/channel
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from typing import Optional, List
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/overview")
def get_profile_overview(
    platform: str = Query(..., description="Platform name (e.g., 'instagram', 'linkedin', 'twitter')"),
    channel_id: Optional[int] = Query(None, description="Specific channel ID (optional)"),
    db: Session = Depends(get_db)
):
    """
    Get profile overview for a platform/channel.
    
    Returns:
    - display_name: Account name
    - platform: Platform identifier
    - channel_id: Channel ID
    - connected: Connection status
    - total_posts: Total posts targeting this channel/platform
    - published_posts: Number of published posts
    - latest_posts: Latest 12 posts with thumbnails
    """
    logger.info(f"[PROFILE] Getting overview for platform={platform}, channel_id={channel_id}")
    
    # Resolve channel
    if channel_id:
        channel = db.query(models.Channel).filter(
            models.Channel.id == channel_id,
            models.Channel.platform == platform
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found for platform {platform}")
    else:
        # Get first active channel for this platform
        channel = db.query(models.Channel).filter(
            models.Channel.platform == platform,
            models.Channel.is_active == True
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail=f"No active channel found for platform {platform}")
    
    logger.info(f"[PROFILE] Using channel: {channel.name} (ID: {channel.id})")
    
    # Get posts targeting this channel
    # Posts store channel IDs in the 'channels' JSON array
    all_posts = db.query(models.Post).all()
    
    # Filter posts that target this channel
    channel_posts = []
    for post in all_posts:
        if isinstance(post.channels, list) and channel.id in post.channels:
            channel_posts.append(post)
        # Also include posts that use platform strings (backwards compatibility)
        elif isinstance(post.channels, list) and platform in post.channels:
            channel_posts.append(post)
    
    total_posts = len(channel_posts)
    published_posts = len([p for p in channel_posts if p.status in ["published", "posted"]])
    
    logger.info(f"[PROFILE] Found {total_posts} total posts, {published_posts} published")
    
    # Get latest 12 posts
    latest_posts = sorted(channel_posts, key=lambda p: p.created_at, reverse=True)[:12]
    
    # Build post data with thumbnails
    posts_data = []
    for post in latest_posts:
        # Get thumbnail from first asset
        thumbnail_url = None
        if post.media_assets and len(post.media_assets) > 0:
            asset_id = post.media_assets[0]
            asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
            if asset:
                # Convert file path to URL
                if asset.file_path.startswith("http"):
                    thumbnail_url = asset.file_path
                else:
                    # Local file - construct URL
                    public_base = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
                    thumbnail_url = f"{public_base}/{asset.file_path}"
        
        # Get published_at from platform_settings if available
        published_at = None
        if isinstance(post.platform_settings, dict):
            published_at = post.platform_settings.get("published_at")
        
        posts_data.append({
            "post_id": post.id,
            "caption": post.content or "",
            "status": post.status,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "published_at": published_at,
            "thumbnail_url": thumbnail_url
        })
    
    return {
        "display_name": channel.name,
        "platform": channel.platform,
        "channel_id": channel.id,
        "connected": channel.is_active,
        "total_posts": total_posts,
        "published_posts": published_posts,
        "latest_posts": posts_data
    }


@router.get("/posts")
def get_profile_posts(
    platform: str = Query(..., description="Platform name"),
    channel_id: Optional[int] = Query(None, description="Specific channel ID (optional)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(12, ge=1, le=100, description="Posts per page"),
    db: Session = Depends(get_db)
):
    """
    Get paginated posts for a platform/channel.
    
    Returns list of posts with card-oriented data.
    """
    logger.info(f"[PROFILE] Getting posts for platform={platform}, channel_id={channel_id}, page={page}")
    
    # Resolve channel
    if channel_id:
        channel = db.query(models.Channel).filter(
            models.Channel.id == channel_id,
            models.Channel.platform == platform
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
    else:
        # Get first active channel for this platform
        channel = db.query(models.Channel).filter(
            models.Channel.platform == platform,
            models.Channel.is_active == True
        ).first()
        
        if not channel:
            raise HTTPException(status_code=404, detail=f"No active channel found for platform {platform}")
    
    # Get all posts and filter
    all_posts = db.query(models.Post).all()
    
    channel_posts = []
    for post in all_posts:
        if isinstance(post.channels, list) and channel.id in post.channels:
            channel_posts.append(post)
        # Backwards compatibility with platform strings
        elif isinstance(post.channels, list) and platform in post.channels:
            channel_posts.append(post)
    
    # Sort by created_at descending
    channel_posts.sort(key=lambda p: p.created_at, reverse=True)
    
    # Pagination
    total = len(channel_posts)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_posts = channel_posts[start_idx:end_idx]
    
    # Build response
    posts_data = []
    for post in paginated_posts:
        # Get thumbnail
        thumbnail_url = None
        if post.media_assets and len(post.media_assets) > 0:
            asset_id = post.media_assets[0]
            asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
            if asset:
                if asset.file_path.startswith("http"):
                    thumbnail_url = asset.file_path
                else:
                    public_base = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
                    thumbnail_url = f"{public_base}/{asset.file_path}"
        
        posts_data.append({
            "id": post.id,
            "content": post.content or "",
            "status": post.status,
            "scheduled_time": post.scheduled_time.isoformat() if post.scheduled_time else None,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "platform_settings": post.platform_settings or {},
            "thumbnail_url": thumbnail_url
        })
    
    return {
        "posts": posts_data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }

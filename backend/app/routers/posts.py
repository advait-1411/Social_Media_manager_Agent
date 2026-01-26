from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import logging
import requests

logger = logging.getLogger(__name__)

router = APIRouter()

class PostCreate(BaseModel):
    content: str
    media_assets: List[int]
    status: str = "draft"
    channels: List[int]
    scheduled_time: Optional[datetime] = None
    platform_settings: Optional[dict] = {}

class PostUpdate(BaseModel):
    content: Optional[str] = None
    media_assets: Optional[List[int]] = None
    status: Optional[str] = None
    scheduled_time: Optional[datetime] = None
    platform_settings: Optional[dict] = None

@router.post("/", response_model=dict)
def create_post(post: PostCreate, db: Session = Depends(get_db)):
    db_post = models.Post(
        content=post.content,
        media_assets=post.media_assets,
        status=post.status,
        channels=post.channels,
        scheduled_time=post.scheduled_time,
        platform_settings=post.platform_settings
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    return {"id": db_post.id, "message": "Post created successfully"}

@router.get("/")
def get_posts(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Post)
    if status and status != "all":
        query = query.filter(models.Post.status == status)
    return query.order_by(models.Post.scheduled_time.asc(), models.Post.created_at.desc()).all()

@router.get("/{post_id}")
def get_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post

@router.put("/{post_id}")
def update_post(post_id: int, updates: PostUpdate, db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(post, key, value)
    
    db.commit()
    db.refresh(post)
    return post

@router.post("/{post_id}/publish")
def publish_post(post_id: int, db: Session = Depends(get_db)):
    from ..services.instagram_publishing import post_to_instagram
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Get Instagram Channel (assuming single/first one for now)
    # In a real app, 'post.channels' list would map to specific channel IDs
    channel = db.query(models.Channel).filter(models.Channel.platform == "instagram").first()
    
    # Priority: .env file takes precedence over database (allows easy token updates)
    # Check .env first
    env_user_id = os.getenv("INSTAGRAM_USER_ID")
    env_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
    
    user_id = None
    token = None
    
    if env_user_id and env_token:
        # Use .env credentials (sanitize them)
        user_id = env_user_id.strip().strip('"').strip("'")
        token = env_token.strip().strip('"').strip("'")
        logger.info(f"[POST PUBLISH] Using credentials from .env file (source of truth)")
        
        # Update or create channel with .env credentials to keep them in sync
        if channel:
            channel.credentials = {"user_id": user_id, "access_token": token}
            logger.info(f"[POST PUBLISH] Updated database channel with .env credentials")
        else:
            channel = models.Channel(
                platform="instagram",
                name="Default Account",
                credentials={"user_id": user_id, "access_token": token}
            )
            db.add(channel)
            logger.info(f"[POST PUBLISH] Created new channel with .env credentials")
        db.commit()
    elif channel and channel.credentials:
        # Fall back to database if .env is not set
        creds = channel.credentials
        user_id = creds.get("user_id")
        token = creds.get("access_token")
        logger.info(f"[POST PUBLISH] Using credentials from database channel (no .env found)")
    else:
        raise HTTPException(
            status_code=400, 
            detail="No Instagram credentials found. Please set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in backend/.env file."
        )
    
    if not user_id or not token:
        raise HTTPException(status_code=400, detail="Invalid channel credentials")
    
    logger.info(f"[POST PUBLISH] Using Instagram User ID: {user_id[:10]}...")
    logger.info(f"[POST PUBLISH] Token length: {len(token)} characters")
    logger.info(f"[POST PUBLISH] Token preview: {token[:10]}...{token[-4:]}")

    # Get Image URL
    # For generated images served locally, we need a public URL for Instagram to fetch.
    # Tunneling (ngrok) is usually required for localhost dev.
    # For this demo, if the image URL is local, we might mock the success OR warn the user.
    
    # Assume 'media_assets' contains IDs of Asset models with file paths.
    if not post.media_assets:
        raise HTTPException(status_code=400, detail="Post has no media assets")
        
    asset_id = post.media_assets[0] # Take first asset
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Convert file_path to URL and handle hosting if needed
    # Asset.file_path is like "generated_images/filename.jpg"
    file_path = asset.file_path
    
    logger.info(f"[POST PUBLISH] Starting publish process for post ID: {post_id}")
    logger.info(f"[POST PUBLISH] Asset file_path: {file_path}")
    
    # If it's already a URL (starts with http), use it directly
    if file_path.startswith("http://") or file_path.startswith("https://"):
        image_url = file_path
        logger.info(f"[POST PUBLISH] Asset is already a URL: {image_url}")
    else:
        # Convert local path to URL
        # Remove leading ./ or / if present
        clean_path = file_path.lstrip('./').lstrip('/')
        # Construct full URL
        base_url = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
        image_url = f"{base_url}/{clean_path}"
        logger.info(f"[POST PUBLISH] Converted local path to URL: {image_url}")
    
    # Check if localhost (Instagram API can't reach localhost)
    # We need to upload to a hosting service first
    if "localhost" in image_url or "127.0.0.1" in image_url:
        logger.info(f"[POST PUBLISH] Image URL is localhost, need to upload to hosting service")
        
        # Check if we have a tunnel URL in env
        public_base = os.getenv("PUBLIC_BASE_URL")
        if public_base and not public_base.startswith("http://localhost") and not public_base.startswith("http://127.0.0.1"):
            # Use tunnel URL
            logger.info(f"[POST PUBLISH] Using tunnel URL: {public_base}")
            image_url = image_url.replace("http://localhost:8000", public_base)
            image_url = image_url.replace("http://127.0.0.1:8000", public_base)
        else:
            # Upload to hosting service (Freeimage.host)
            logger.info(f"[POST PUBLISH] Uploading image to hosting service (Freeimage.host)...")
            try:
                # Get absolute path to the image file
                abs_path = os.path.abspath(file_path)
                if not os.path.exists(abs_path):
                    raise HTTPException(status_code=404, detail=f"Image file not found: {abs_path}")
                
                logger.info(f"[POST PUBLISH] Image file path: {abs_path}")
                
                # Upload to Freeimage.host
                freeimage_api_key = os.getenv("FREEIMAGE_HOST_API_KEY", "6d207e02198a847aa98d0a27a")
                upload_url = "https://freeimage.host/api/1/upload"
                
                logger.info(f"[POST PUBLISH] Uploading to Freeimage.host API...")
                
                with open(abs_path, 'rb') as image_file:
                    files = {'source': image_file}
                    data = {'key': freeimage_api_key, 'format': 'json'}
                    
                    import requests
                    response = requests.post(upload_url, files=files, data=data, timeout=60)
                    response.raise_for_status()
                    
                    result = response.json()
                    
                    if result.get('status_code') == 200:
                        image_info = result.get('image', {})
                        public_url = image_info.get('url')
                        if public_url:
                            image_url = public_url
                            logger.info(f"[POST PUBLISH] ✓ Image uploaded to hosting service successfully")
                            logger.info(f"[POST PUBLISH] Public URL: {image_url}")
                        else:
                            raise HTTPException(
                                status_code=500,
                                detail="Hosting service did not return a URL"
                            )
                    else:
                        error_msg = result.get('error', {}).get('message', 'Unknown error') if isinstance(result.get('error'), dict) else str(result)
                        logger.error(f"[POST PUBLISH] ✗ Hosting upload failed: {error_msg}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to upload image to hosting service: {error_msg}"
                        )
            except requests.exceptions.RequestException as e:
                logger.error(f"[POST PUBLISH] ✗ Network error during hosting upload: {str(e)}")
                raise HTTPException(
                    status_code=503,
                    detail=f"Network error while uploading to hosting service: {str(e)}"
                )
            except Exception as e:
                logger.error(f"[POST PUBLISH] ✗ Error uploading to hosting service: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload image to hosting service: {str(e)}"
                )

    # Now post to Instagram
    logger.info(f"[POST PUBLISH] Posting to Instagram with URL: {image_url}")
    logger.info(f"[POST PUBLISH] Caption: {post.content[:50]}..." if post.content else "[POST PUBLISH] No caption")
    
    try:
        media_id = post_to_instagram(image_url, post.content or "", user_id, token)
        logger.info(f"[POST PUBLISH] ✓ Post published successfully to Instagram")
        logger.info(f"[POST PUBLISH] Media ID: {media_id}")
        
        post.status = "published"
        post.platform_settings = {**post.platform_settings, "instagram_media_id": media_id}
        db.commit()
        
        logger.info(f"[POST PUBLISH] ✓ Post status updated in database")
        
        return {
            "message": "Post published successfully to Instagram",
            "status": "published",
            "media_id": media_id
        }
    except Exception as e:
        error_message = str(e)
        logger.error(f"[POST PUBLISH] ✗ Instagram API failed: {error_message}")
        
        # Provide more helpful error messages
        if "expired" in error_message.lower() or "token" in error_message.lower():
            detail_message = f"{error_message}\n\nTo fix this:\n1. Go to https://developers.facebook.com/tools/explorer/\n2. Generate a new long-lived access token\n3. Update INSTAGRAM_ACCESS_TOKEN in backend/.env file\n4. Restart the backend server"
        else:
            detail_message = error_message
        
        raise HTTPException(status_code=500, detail=detail_message)

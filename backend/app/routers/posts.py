from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timezone
import logging
import pytz
from ..socket_manager import socket_manager
from pydantic import BaseModel, Field
from ..services.image_gen import generate_images_service
from ..services.ai_assistant import generate_caption

# Define logger
logger = logging.getLogger(__name__)

# Timezone helper
def normalize_to_utc(dt: datetime) -> datetime:
    """
    Normalize a datetime to UTC.
    If naive, assume Asia/Kolkata (IST) as per user environment.
    If aware, convert to UTC.
    """
    if dt.tzinfo is None:
        # Assume IST for naive datetimes from frontend
        local_tz = pytz.timezone("Asia/Kolkata")
        dt = local_tz.localize(dt)
    return dt.astimezone(timezone.utc)

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

class ScheduleRequest(BaseModel):
    scheduled_time: datetime
    status: Optional[str] = "scheduled"  # must be "scheduled" or "approved"

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


@router.post("/create-and-publish", response_model=dict)
async def create_and_publish_post(post: PostCreate, db: Session = Depends(get_db)):
    """
    Create a post (carousel, reel, or image) and immediately trigger the publishing process.
    If publishing fails, the post is still saved as a draft, and the error is returned.
    """
    from ..services.scheduler import publish_post_now

    # 1. Create the post in the database
    db_post = models.Post(
        content=post.content,
        media_assets=post.media_assets,
        status="draft",  # Start as draft, publish_post_now will update it
        channels=post.channels,
        scheduled_time=post.scheduled_time,
        platform_settings=post.platform_settings
    )
    db.add(db_post)
    db.commit()
    db.refresh(db_post)

    logger.info(f"[CREATE & PUBLISH] Created post ID: {db_post.id}, starting publish...")

    try:
        # 2. Trigger publishing immediately
        media_id = publish_post_now(db, db_post)

        # Emit socket event
        await socket_manager.emit('post_status', {
            'id': db_post.id,
            'status': 'published',
            'title': db_post.content[:20] + '...' if db_post.content else 'Post',
            'message': 'Post published successfully!'
        })

        return {
            "id": db_post.id,
            "message": "Post created and published successfully",
            "status": "published",
            "media_id": media_id
        }
    except Exception as e:
        error_message = str(e)
        logger.error(f"[CREATE & PUBLISH] ✗ Failed to publish post {db_post.id}: {error_message}")
        
        # Provide more helpful error messages
        if "expired" in error_message.lower() or "token" in error_message.lower():
            detail_message = f"{error_message}\n\nTo fix this:\n1. Go to https://developers.facebook.com/tools/explorer/\n2. Generate a new long-lived access token\n3. Update INSTAGRAM_ACCESS_TOKEN in backend/.env file\n4. Restart the backend server"
        else:
            detail_message = error_message
        
        # Return a 200 response with the error details, so the client knows the post was created
        return {
            "id": db_post.id,
            "message": "Post created but publishing failed",
            "status": "draft",
            "error": detail_message,
            "media_id": None
        }

@router.get("/")
def get_posts(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Post)
    if status and status != "all":
        query = query.filter(models.Post.status == status)
    return query.order_by(models.Post.scheduled_time.asc(), models.Post.created_at.desc()).all()

@router.get("/calendar", response_model=List[dict])
def get_calendar_posts(
    start_date: date,
    end_date: date,
    status: Optional[str] = "scheduled",
    db: Session = Depends(get_db),
):
    """
    Get posts for calendar view within a date range.
    Treats stored times as UTC.
    """
    # Convert dates to datetime for comparison (start of day, end of day)
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    
    query = db.query(models.Post).filter(
        models.Post.scheduled_time.isnot(None),
        models.Post.scheduled_time >= start_dt,
        models.Post.scheduled_time <= end_dt
    )
    
    if status != "all":
        query = query.filter(models.Post.status == status)
        
    posts = query.all()
    
    return [
        {
            "id": post.id,
            "content": post.content,
            "status": post.status,
            # Ensure we return valid ISO string with timezone info (Z or +00:00)
            "scheduled_time": post.scheduled_time.replace(tzinfo=timezone.utc).isoformat() if post.scheduled_time else None,
            "platforms": post.channels or [],
            "platform_settings": post.platform_settings or {},
            "last_error": post.last_error
        }
        for post in posts
    ]

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
async def publish_post(post_id: int, db: Session = Depends(get_db)):
    from ..services.scheduler import publish_post_now
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    logger.info(f"[POST PUBLISH] Manual publish requested for post ID: {post_id}")
    
    try:
        # Use the shared helper which handles idempotency, credentials, and image hosting
        media_id = publish_post_now(db, post)
        
        # Emit socket event
        await socket_manager.emit('post_status', {
            'id': post_id,
            'status': 'published',
            'title': post.content[:20] + '...' if post.content else 'Post',
            'message': 'Post published successfully!'
        })

        return {
            "message": "Post published successfully to Instagram",
            "status": "published",
            "media_id": media_id
        }
    except Exception as e:
        error_message = str(e)
        logger.error(f"[POST PUBLISH] ✗ Failed: {error_message}")
        
        # Provide more helpful error messages
        if "expired" in error_message.lower() or "token" in error_message.lower():
            detail_message = f"{error_message}\n\nTo fix this:\n1. Go to https://developers.facebook.com/tools/explorer/\n2. Generate a new long-lived access token\n3. Update INSTAGRAM_ACCESS_TOKEN in backend/.env file\n4. Restart the backend server"
        else:
            detail_message = error_message
        
        raise HTTPException(status_code=500, detail=detail_message)

@router.post("/{post_id}/schedule", response_model=dict)
async def schedule_post(post_id: int, body: ScheduleRequest, db: Session = Depends(get_db)):
    """
    Schedule a post for future publishing.
    """
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Validate status
    if body.status not in ["scheduled", "approved"]:
        raise HTTPException(status_code=400, detail="Status must be 'scheduled' or 'approved'")
    
    # Normalize scheduled_time to UTC
    # If naive (from frontend), assume Asia/Kolkata (IST)
    # Then convert to UTC for consistent DB storage and scheduler comparison
    utc_scheduled_time = normalize_to_utc(body.scheduled_time)
    
    # Update scheduling fields
    post.scheduled_time = utc_scheduled_time
    post.status = body.status
    post.last_error = None  # Clear any previous errors
    
    db.commit()
    db.refresh(post)
    
    # FIXED: logger is now defined so this won't crash
    logger.info(f"[SCHEDULE] Post {post_id} scheduled for {utc_scheduled_time.isoformat()} (UTC) - original input: {body.scheduled_time}")
    
    # Emit socket event
    await socket_manager.emit('post_status', {
        'id': post_id,
        'status': 'scheduled',
        'title': post.content[:20] + '...' if post.content else 'Post',
        'message': f'Post scheduled for {utc_scheduled_time.strftime("%b %d, %H:%M")}'
    })
    
    # Create notification
    notification = models.Notification(
        post_id=post.id,
        title="Post Scheduled",
        message=f"Post scheduled for {utc_scheduled_time.strftime('%b %d, %H:%M')}",
        type="info"
    )
    db.add(notification)
    db.commit()

    return {
        "id": post.id,
        "status": post.status,
        "scheduled_time": post.scheduled_time.isoformat()
    }


# --- Models for Bulk Variation and Batch Create ---

class AssetOut(BaseModel):
    id: int
    file_path: str
    asset_type: str
    prompt: Optional[str] = None
    system_prompt: Optional[str] = None
    tags: Optional[List[str]] = []
    created_at: datetime
    meta_data: Optional[dict] = {}
    brand_kit_id: Optional[int] = None

    class Config:
        orm_mode = True
        from_attributes = True

class BulkVariationRequest(BaseModel):
    prompt: str
    brand_kit_id: Optional[int] = None
    count: int = Field(default=3, ge=1, le=5)
    platforms: List[str] = ["instagram"]
    tone: Optional[str] = "professional"

class VariationItem(BaseModel):
    asset: AssetOut
    caption: str
    brand_kit_id: Optional[int]

class BulkVariationResponse(BaseModel):
    variations: List[VariationItem]
    brand_kit_name: Optional[str]
    prompt_used: str

class BatchVariationItem(BaseModel):
    asset_id: int
    caption: str
    is_primary: bool = False

class BatchCreateRequest(BaseModel):
    variations: List[BatchVariationItem]
    channels: List[int]
    platforms: List[str]
    brand_kit_id: Optional[int] = None

class BatchCreateResponse(BaseModel):
    primary_post_id: int
    draft_post_ids: List[int]
    total_created: int


@router.post("/generate-bulk-variations", response_model=BulkVariationResponse)
async def generate_bulk_variations(request: BulkVariationRequest, db: Session = Depends(get_db)):
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt cannot be empty")
            
        kit = None
        system_prompt = None
        logo_path = None
        kit_name = None
        
        if request.brand_kit_id is not None:
            kit = db.query(models.BrandKit).filter(models.BrandKit.id == request.brand_kit_id).first()
            if not kit:
                raise HTTPException(status_code=404, detail="Brand kit not found")
            system_prompt = kit.system_prompt
            logo_path = kit.logo_light_path
            kit_name = kit.name
            
        if system_prompt:
            final_prompt = f"{system_prompt}\n\n{request.prompt}"
        else:
            final_prompt = request.prompt
            
        try:
            generated_paths = await generate_images_service(
                prompt=final_prompt,
                user_prompt=request.prompt,
                count=request.count,
                model="google/gemini-2.5-flash-image",
                logo_path=logo_path
            )
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")
            
        if not generated_paths:
             raise HTTPException(status_code=500, detail="Image generation failed: returned no paths")

        assets = []
        for p in generated_paths:
            asset = models.Asset(
                file_path=p,
                asset_type="image",
                prompt=request.prompt,
                system_prompt=system_prompt,
                brand_kit_id=request.brand_kit_id if kit else None,
                meta_data={"source": "bulk_variation"}
            )
            db.add(asset)
            assets.append(asset)
            
        db.commit()
        for a in assets:
            db.refresh(a)
            
        # Generate captions
        variations = []
        platform = request.platforms[0] if request.platforms else "instagram"
        
        for i, asset in enumerate(assets):
            caption = ""
            try:
                caption = await generate_caption(
                    prompt=request.prompt,
                    platform=platform,
                    tone=request.tone or "professional",
                    variation_hint=f"Variation {i+1} of {request.count}"
                )
            except Exception as e:
                logger.warning(f"Variation {i+1} caption failed: {e}")
                
            variations.append(VariationItem(
                asset=asset,
                caption=caption,
                brand_kit_id=request.brand_kit_id if kit else None
            ))
            
        return BulkVariationResponse(
            variations=variations,
            brand_kit_name=kit_name,
            prompt_used=final_prompt
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in generate-bulk-variations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-create", response_model=BatchCreateResponse)
async def batch_create_posts(request: BatchCreateRequest, db: Session = Depends(get_db)):
    if not request.variations:
        raise HTTPException(status_code=400, detail="At least 1 variation required")
        
    primary_count = sum(1 for v in request.variations if v.is_primary)
    
    # Ensure exactly 1 is primary
    if primary_count == 0:
        request.variations[0].is_primary = True
    elif primary_count > 1:
        raise HTTPException(status_code=400, detail="Exactly 1 variation can be marked as primary")
        
    posts = []
    
    for variation in request.variations:
        asset = db.query(models.Asset).filter(models.Asset.id == variation.asset_id).first()
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset ID {variation.asset_id} not found")
            
        post = models.Post(
            content=variation.caption,
            media_assets=[variation.asset_id],
            channels=request.channels,
            status="draft",
            platform_settings={
                "is_primary_variation": variation.is_primary,
                "brand_kit_id": request.brand_kit_id,
                "platforms": request.platforms
            }
        )
        db.add(post)
        posts.append(post)
        
    db.commit()
    for post in posts:
        db.refresh(post)
        
    primary_post = next((p for p, v in zip(posts, request.variations) if v.is_primary), posts[0])
    draft_post_ids = [p.id for p in posts if p.id != primary_post.id]

    await socket_manager.emit("batch_posts_created", {
        "count": len(posts),
        "primary_post_id": primary_post.id,
        "draft_count": len(posts) - 1,
        "message": f"{len(posts)} variations saved. 1 active, {len(posts) - 1} drafted."
    })
    
    return BatchCreateResponse(
        primary_post_id=primary_post.id,
        draft_post_ids=draft_post_ids,
        total_created=len(posts)
    )


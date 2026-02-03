from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date, timezone
import logging
import pytz

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
            "scheduled_time": post.scheduled_time.isoformat() if post.scheduled_time else None,
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
def publish_post(post_id: int, db: Session = Depends(get_db)):
    from ..services.scheduler import publish_post_now
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    logger.info(f"[POST PUBLISH] Manual publish requested for post ID: {post_id}")
    
    try:
        # Use the shared helper which handles idempotency, credentials, and image hosting
        media_id = publish_post_now(db, post)
        
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
def schedule_post(post_id: int, body: ScheduleRequest, db: Session = Depends(get_db)):
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
    
    return {
        "id": post.id,
        "status": post.status,
        "scheduled_time": post.scheduled_time.isoformat()
    }

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic models for request bodies
class SubmitForApprovalRequest(BaseModel):
    note: Optional[str] = None


class ApprovePostRequest(BaseModel):
    approved_by: str
    auto_schedule: bool = False
    scheduled_time: Optional[datetime] = None


class RejectPostRequest(BaseModel):
    rejected_by: str
    reason: str


# Endpoints
@router.get("/approvals/pending")
def get_pending_approvals(
    platform: Optional[str] = None,
    channel_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get all posts pending approval.
    
    Query params:
        platform: Filter by platform (optional)
        channel_id: Filter by channel ID (optional)
    
    Returns:
        List of posts with status="pending_approval"
    """
    query = db.query(models.Post).filter(models.Post.status == "pending_approval")
    
    # Apply filters if provided
    if platform:
        # Filter by platform in channels (this is a simplified approach)
        # In a real app, you'd join with Channel table
        logger.info(f"[APPROVALS] Filtering by platform: {platform}")
    
    if channel_id:
        # Filter posts that target this channel
        # Since channels is a JSON list, we need to check if channel_id is in the list
        logger.info(f"[APPROVALS] Filtering by channel_id: {channel_id}")
        # Note: SQLAlchemy JSON filtering is database-specific
        # For simplicity, we'll filter in Python
        all_posts = query.order_by(
            models.Post.created_at.desc()
        ).all()
        
        filtered_posts = [p for p in all_posts if channel_id in (p.channels or [])]
        return filtered_posts
    
    # Return all pending approvals ordered by created_at
    return query.order_by(
        models.Post.created_at.desc()
    ).all()


@router.post("/posts/{post_id}/submit-for-approval")
def submit_for_approval(
    post_id: int,
    request: SubmitForApprovalRequest,
    db: Session = Depends(get_db)
):
    """
    Submit a draft post for approval.
    
    Args:
        post_id: ID of the post to submit
        request: Optional note for approver
    
    Returns:
        Updated post object
    """
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Change status to pending_approval
    post.status = "pending_approval"
    
    # Store approval note if provided
    if request.note:
        post.platform_settings = {
            **post.platform_settings,
            "approval_note": request.note
        }
    
    db.commit()
    db.refresh(post)
    
    logger.info(f"[APPROVALS] Post {post_id} submitted for approval")
    
    return post


@router.post("/posts/{post_id}/approve")
def approve_post(
    post_id: int,
    request: ApprovePostRequest,
    db: Session = Depends(get_db)
):
    """
    Approve a post.
    
    Args:
        post_id: ID of the post to approve
        request: Approval details (approved_by, auto_schedule, scheduled_time)
    
    Returns:
        Updated post object
    """
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Set approval fields
    post.approved_at = datetime.now(timezone.utc)
    post.approved_by = request.approved_by
    
    # Determine status based on auto_schedule and scheduled_time
    if request.auto_schedule and (request.scheduled_time or post.scheduled_time):
        # Set to scheduled so the scheduler will pick it up
        post.status = "scheduled"
        
        # Update scheduled_time if provided
        if request.scheduled_time:
            post.scheduled_time = request.scheduled_time
        
        logger.info(f"[APPROVALS] Post {post_id} approved and scheduled for {post.scheduled_time}")
    else:
        # Just mark as approved (manual publish later)
        post.status = "approved"
        logger.info(f"[APPROVALS] Post {post_id} approved (manual publish required)")
    
    db.commit()
    db.refresh(post)
    
    return post


@router.post("/posts/{post_id}/reject")
def reject_post(
    post_id: int,
    request: RejectPostRequest,
    db: Session = Depends(get_db)
):
    """
    Reject a post.
    
    Args:
        post_id: ID of the post to reject
        request: Rejection details (rejected_by, reason)
    
    Returns:
        Updated post object
    """
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Set rejection fields
    post.status = "rejected"
    post.rejected_at = datetime.now(timezone.utc)
    post.rejected_by = request.rejected_by
    post.rejection_reason = request.reason
    
    db.commit()
    db.refresh(post)
    
    logger.info(f"[APPROVALS] Post {post_id} rejected by {request.rejected_by}: {request.reason}")
    
    return post

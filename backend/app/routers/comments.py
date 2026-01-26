"""
Comments Router
Handles comment fetching, analysis, and replying for Instagram posts
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
from typing import List, Optional, Tuple
from datetime import datetime, timezone
import os
import logging
from ..services.instagram_comments import get_post_comments, reply_to_comment
from ..services.ai_assistant import analyze_comment, generate_comment_reply

logger = logging.getLogger(__name__)
router = APIRouter()

# Pydantic models
class CommentOut(BaseModel):
    id: int
    post_id: int
    platform: str
    external_comment_id: str
    parent_external_id: Optional[str]
    author_username: Optional[str]
    text: str
    sentiment: str
    category: str
    ai_reply_suggested: bool
    ai_reply_text: Optional[str]
    replied: bool
    hidden: bool
    deleted: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SuggestReplyRequest(BaseModel):
    tone: str = "friendly"

class ReplyRequest(BaseModel):
    reply_text: str


def resolve_instagram_credentials(db: Session) -> Tuple[str, str]:
    """
    Resolve Instagram credentials from .env or database channel.
    Returns (user_id, token).
    Raises HTTPException if credentials not found.
    """
    # Priority: .env file takes precedence
    env_user_id = os.getenv("INSTAGRAM_USER_ID")
    env_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
    
    user_id = None
    token = None
    
    if env_user_id and env_token:
        user_id = env_user_id.strip().strip('"').strip("'")
        token = env_token.strip().strip('"').strip("'")
        logger.info(f"[COMMENTS] Using credentials from .env file")
        
        # Sync to database channel
        channel = db.query(models.Channel).filter(models.Channel.platform == "instagram").first()
        if channel:
            channel.credentials = {"user_id": user_id, "access_token": token}
            logger.info(f"[COMMENTS] Updated database channel with .env credentials")
        else:
            channel = models.Channel(
                platform="instagram",
                name="Default Account",
                credentials={"user_id": user_id, "access_token": token}
            )
            db.add(channel)
            logger.info(f"[COMMENTS] Created new channel with .env credentials")
        db.commit()
    else:
        # Fall back to database
        channel = db.query(models.Channel).filter(models.Channel.platform == "instagram").first()
        if channel and channel.credentials:
            creds = channel.credentials
            user_id = creds.get("user_id")
            token = creds.get("access_token")
            logger.info(f"[COMMENTS] Using credentials from database channel")
        else:
            raise HTTPException(
                status_code=400,
                detail="No Instagram credentials found. Please set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in backend/.env file."
            )
    
    if not user_id or not token:
        raise HTTPException(status_code=400, detail="Invalid channel credentials")
    
    return user_id, token


@router.get("/posts/{post_id}/comments/sync", response_model=List[CommentOut])
async def sync_comments(post_id: int, db: Session = Depends(get_db)):
    """
    Fetch comments from Instagram for a published post and store them in the database.
    """
    logger.info(f"[COMMENTS] Syncing comments for post ID: {post_id}")
    
    # Fetch the post
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Get Instagram media ID
    platform_settings = post.platform_settings or {}
    media_id = platform_settings.get("instagram_media_id")
    
    if not media_id:
        raise HTTPException(
            status_code=400,
            detail="Post has no instagram_media_id; publish it first."
        )
    
    logger.info(f"[COMMENTS] Instagram media ID: {media_id}")
    
    # Resolve credentials
    user_id, token = resolve_instagram_credentials(db)
    
    # Fetch comments from Instagram
    try:
        logger.info(f"[COMMENTS] Fetching comments from Instagram API...")
        result = get_post_comments(media_id, token, limit=50)
        comments_data = result.get("data", [])
        
        logger.info(f"[COMMENTS] Received {len(comments_data)} comments from Instagram")
        
        # Process each comment
        for comment_data in comments_data:
            external_id = comment_data.get("id")
            if not external_id:
                continue
            
            # Check if comment already exists
            existing = db.query(models.Comment).filter(
                models.Comment.platform == "instagram",
                models.Comment.external_comment_id == external_id
            ).first()
            
            if existing:
                # Update existing comment
                existing.text = comment_data.get("text", existing.text)
                existing.author_username = comment_data.get("username") or existing.author_username
                existing.parent_external_id = comment_data.get("parent_id") or existing.parent_external_id
                existing.updated_at = datetime.now(timezone.utc)
                logger.info(f"[COMMENTS] Updated existing comment: {external_id}")
            else:
                # Create new comment
                new_comment = models.Comment(
                    post_id=post_id,
                    platform="instagram",
                    external_comment_id=external_id,
                    parent_external_id=comment_data.get("parent_id"),
                    author_username=comment_data.get("username"),
                    text=comment_data.get("text", ""),
                    sentiment="unknown",
                    category="general"
                )
                db.add(new_comment)
                
                # Analyze new comment with AI
                if new_comment.text:
                    try:
                        analysis = await analyze_comment(new_comment.text)
                        new_comment.sentiment = analysis.get("sentiment", "unknown")
                        new_comment.category = analysis.get("category", "general")
                        logger.info(f"[COMMENTS] Analyzed new comment: sentiment={new_comment.sentiment}, category={new_comment.category}")
                    except Exception as e:
                        logger.warning(f"[COMMENTS] Failed to analyze comment: {str(e)}")
                
                logger.info(f"[COMMENTS] Created new comment: {external_id}")
        
        db.commit()
        logger.info(f"[COMMENTS] ✓ Comments synced successfully")
        
        # Return all comments for this post
        comments = db.query(models.Comment).filter(
            models.Comment.post_id == post_id
        ).order_by(models.Comment.created_at.desc()).all()
        
        return comments
        
    except Exception as e:
        logger.error(f"[COMMENTS] ✗ Error syncing comments: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to sync comments: {str(e)}")


@router.get("/posts/{post_id}/comments", response_model=List[CommentOut])
def get_comments(
    post_id: int,
    sentiment: Optional[str] = None,
    category: Optional[str] = None,
    unreplied_only: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get stored comments for a post with optional filtering.
    """
    # Verify post exists
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Build query
    query = db.query(models.Comment).filter(models.Comment.post_id == post_id)
    
    # Apply filters
    if sentiment:
        query = query.filter(models.Comment.sentiment == sentiment)
    if category:
        query = query.filter(models.Comment.category == category)
    if unreplied_only:
        query = query.filter(models.Comment.replied == False)
    
    comments = query.order_by(models.Comment.created_at.desc()).all()
    return comments


@router.post("/comments/{comment_id}/suggest-reply")
async def suggest_reply(
    comment_id: int,
    request: SuggestReplyRequest,
    db: Session = Depends(get_db)
):
    """
    Generate an AI-powered reply suggestion for a comment.
    """
    logger.info(f"[COMMENTS] Generating reply suggestion for comment ID: {comment_id}")
    
    # Load comment
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Load post for context
    post = db.query(models.Post).filter(models.Post.id == comment.post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    try:
        # Generate reply
        reply_text = await generate_comment_reply(
            comment.text,
            post.content,
            tone=request.tone
        )
        
        # Save suggestion
        comment.ai_reply_text = reply_text
        comment.ai_reply_suggested = True
        db.commit()
        
        logger.info(f"[COMMENTS] ✓ Reply suggestion generated")
        
        return {
            "success": True,
            "reply": reply_text
        }
        
    except Exception as e:
        logger.error(f"[COMMENTS] ✗ Error generating reply suggestion: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate reply: {str(e)}")


@router.post("/comments/{comment_id}/reply")
def post_reply(
    comment_id: int,
    request: ReplyRequest,
    db: Session = Depends(get_db)
):
    """
    Post a reply to an Instagram comment.
    """
    logger.info(f"[COMMENTS] Posting reply to comment ID: {comment_id}")
    
    # Load comment
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if not comment.external_comment_id:
        raise HTTPException(status_code=400, detail="Comment has no external_comment_id")
    
    # Resolve credentials
    user_id, token = resolve_instagram_credentials(db)
    
    try:
        # Post reply to Instagram
        reply_id = reply_to_comment(comment.external_comment_id, request.reply_text, token)
        
        # Update comment
        comment.replied = True
        if not comment.ai_reply_text:
            comment.ai_reply_text = request.reply_text
        db.commit()
        
        logger.info(f"[COMMENTS] ✓ Reply posted successfully to Instagram")
        logger.info(f"[COMMENTS] Reply ID: {reply_id}")
        
        return {
            "success": True,
            "reply_id": reply_id
        }
        
    except Exception as e:
        logger.error(f"[COMMENTS] ✗ Error posting reply: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to post reply: {str(e)}")

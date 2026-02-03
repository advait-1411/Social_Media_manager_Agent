from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from ..database import Base

class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String, nullable=False)  # Local path or URL
    asset_type = Column(String, default="image")  # image, video
    prompt = Column(Text, nullable=True)
    tags = Column(JSON, default=list)  # List of tags as strings
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    meta_data = Column(JSON, default=dict)  # Model used, params, etc.
    
    # Lineage for variants
    parent_id = Column(Integer, ForeignKey("assets.id"), nullable=True)
    variants = relationship("Asset", backref=backref("parent", remote_side=[id]))

class Channel(Base):
    __tablename__ = "channels"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, nullable=False)  # instagram, linkedin
    name = Column(String, nullable=False)  # Account name
    credentials = Column(JSON, nullable=False)  # Encrypted or just stored for now
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Post(Base):
    __tablename__ = "posts"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=True)  # Caption
    media_assets = Column(JSON, default=list)  # List of asset IDs
    status = Column(String, default="draft")  # draft, pending_approval, approved, scheduled, publishing, published, rejected, failed
    scheduled_time = Column(DateTime(timezone=True), nullable=True)
    channels = Column(JSON, default=list) # List of channel IDs targetted
    platform_settings = Column(JSON, default=dict)  # Per platform specific data (captions etc)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Approval workflow fields
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String, nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    rejected_by = Column(String, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    
    # Scheduling fields
    last_publish_attempt_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    platform = Column(String, nullable=False)  # instagram, linkedin, etc.
    external_comment_id = Column(String, nullable=False)  # Instagram comment ID
    parent_external_id = Column(String, nullable=True)  # Parent comment ID for threads
    author_username = Column(String, nullable=True)
    text = Column(Text, nullable=False)
    sentiment = Column(String, default="unknown")  # positive, neutral, negative, unknown
    category = Column(String, default="general")  # question, complaint, spam, praise, general
    ai_reply_suggested = Column(Boolean, default=False)
    ai_reply_text = Column(Text, nullable=True)
    replied = Column(Boolean, default=False)  # Whether we have replied via API
    hidden = Column(Boolean, default=False)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

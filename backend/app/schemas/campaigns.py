"""
Pydantic schemas for the Campaigns & Draft Library feature.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator

ALLOWED_PLATFORMS = {"instagram", "linkedin", "twitter"}
ALLOWED_STATUSES = {"draft", "pending_approval"}


# ─── Post Blueprint ────────────────────────────────────────────────────────────

class PostBlueprint(BaseModel):
    """One AI-generated post idea within a campaign, stored in JSON."""
    blueprint_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    platform: str
    asset_id: Optional[int] = None
    asset_ids: Optional[List[int]] = None  # Carousel: multiple assets (takes precedence over asset_id)
    image_prompt: Optional[str] = None
    caption: str
    hashtags: List[str] = []
    # "blueprint" = not yet committed; "committed" = turned into a real Post row
    status: str = "blueprint"

    @validator("platform")
    def check_platform(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ALLOWED_PLATFORMS:
            raise ValueError(f"Unsupported platform '{v}'. Choose from {ALLOWED_PLATFORMS}.")
        return v

    @validator("hashtags", each_item=True)
    def ensure_hash_prefix(cls, v: str) -> str:
        v = v.strip()
        return v if v.startswith("#") else f"#{v}"

    @validator("hashtags")
    def cap_hashtags(cls, v: List[str]) -> List[str]:
        return v[:30]


# ─── Campaign File (stored as JSON on disk) ───────────────────────────────────

class CampaignFile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    strategy: str
    created_at: datetime
    updated_at: datetime
    business_context: Optional[str] = None
    guidelines: Optional[Dict[str, Any]] = None
    platforms: List[str]
    posts: List[PostBlueprint]


# ─── Campaign metadata (for list endpoint) ───────────────────────────────────

class CampaignMeta(BaseModel):
    id: str
    title: str
    strategy: str
    created_at: datetime
    platforms: List[str]
    post_count: int


# ─── Generation request / response ────────────────────────────────────────────

class CampaignGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)
    business_context: Optional[str] = Field(None, max_length=2000)
    asset_ids: List[int] = []
    logo_id: Optional[int] = None
    platforms: List[str] = ["instagram"]
    guidelines: Optional[Dict[str, Any]] = None
    num_campaigns: int = Field(1, ge=1, le=5)
    posts_per_campaign: int = Field(5, ge=2, le=10)

    @validator("platforms", each_item=True)
    def check_platforms(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ALLOWED_PLATFORMS:
            raise ValueError(f"Unsupported platform '{v}'.")
        return v


class CampaignGenerationResponse(BaseModel):
    campaigns: List[CampaignFile]


# ─── Commit request ───────────────────────────────────────────────────────────

class CommitCampaignRequest(BaseModel):
    """Commit a set of blueprints (by blueprint_id) into real Post rows."""
    blueprint_ids: List[str]
    default_status: str = "draft"

    @validator("default_status")
    def check_status(cls, v: str) -> str:
        if v not in ALLOWED_STATUSES:
            raise ValueError(f"Status must be one of {ALLOWED_STATUSES}.")
        return v


class CommitCampaignResponse(BaseModel):
    created_post_ids: List[int]
    message: str


# ─── Patch request ────────────────────────────────────────────────────────────

class CampaignPatchRequest(BaseModel):
    """Partial update for a campaign file.
    Supports updating top-level fields and individual post blueprints by blueprint_id.
    """
    title: Optional[str] = None
    strategy: Optional[str] = None
    # To update a single post: pass a PostBlueprint with the existing blueprint_id
    update_post: Optional[PostBlueprint] = None

"""
Pydantic schemas for the Draft Library feature.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, validator

ALLOWED_PLATFORMS = {"instagram", "linkedin", "twitter"}
ALLOWED_STATUSES = {"draft", "pending_approval"}


# ─── Draft File (stored as JSON on disk) ──────────────────────────────────────

class DraftFile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    caption: str
    asset_ids: List[int] = []
    platforms: List[str] = []
    created_at: datetime
    updated_at: datetime
    source: Optional[str] = "manual"  # "manual" | "ai"


# ─── Draft metadata (for list endpoint) ──────────────────────────────────────

class DraftMeta(BaseModel):
    id: str
    caption: str
    platforms: List[str]
    created_at: datetime
    updated_at: datetime
    asset_count: int


# ─── CRUD request bodies ──────────────────────────────────────────────────────

class DraftCreateRequest(BaseModel):
    caption: str = Field(..., min_length=1, max_length=3000)
    asset_ids: List[int] = []
    platforms: List[str] = []
    source: Optional[str] = "manual"

    @validator("platforms", each_item=True)
    def check_platforms(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ALLOWED_PLATFORMS:
            raise ValueError(f"Unsupported platform '{v}'.")
        return v


class DraftUpdateRequest(BaseModel):
    caption: Optional[str] = Field(None, max_length=3000)
    asset_ids: Optional[List[int]] = None
    platforms: Optional[List[str]] = None

    @validator("platforms", each_item=True)
    def check_platforms(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ALLOWED_PLATFORMS:
            raise ValueError(f"Unsupported platform '{v}'.")
        return v


# ─── Commit response ──────────────────────────────────────────────────────────

class DraftCommitResponse(BaseModel):
    post_id: int
    message: str

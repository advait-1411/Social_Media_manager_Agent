from pydantic import BaseModel
from typing import List, Optional, Dict


class PublishJob(BaseModel):
    """
    Platform-agnostic payload used by the publishing layer and external agents.

    Semantics for Instagram:
      - type == "image"
          Single-image feed post. `media_assets` MUST contain exactly 1 URL.
      - type == "carousel"
          2–10 image URLs in `media_assets`, ordered as they should appear.
      - type == "reel"
          Single video post (we currently avoid routing reels through Composio).
    """

    job_id: str                         # uuid4 string
    post_id: int
    platform: str                       # "instagram"
    type: str                           # "image" | "carousel" | "reel"
    media_assets: List[str]             # list of public URLs (already resolved)
    caption: str
    hashtags: List[str]
    scheduled_time_utc: Optional[str] = None
    channels: Dict[str, str]            # e.g. {"instagram_channel_id": "17841477..."}
    metadata: Dict[str, Optional[str]] = {}

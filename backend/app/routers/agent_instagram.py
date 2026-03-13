"""
agent_instagram.py – Local stub for the Instagram publish agent.

Phase 1: Simulates a successful publish without calling Instagram or Composio.
Phase 2: This stub will be replaced by (or rerouted to) the real MCP-based agent.

Mounted at:  POST /agent/instagram/publish
"""

from fastapi import APIRouter, HTTPException
from ..schemas.publish_job import PublishJob
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/instagram/publish")
async def instagram_publish(job: PublishJob):
    """
    Minimal agent stub for Phase 1.

    Accepts a PublishJob and returns a fake 'published' response.
    Does NOT call Instagram or Composio yet.
    """
    logger.info(
        f"[AGENT-STUB] Received PublishJob {job.job_id} for post {job.post_id} "
        f"(type={job.type})"
    )

    # Basic validation: ensure we have at least one media URL
    if not job.media_assets:
        raise HTTPException(status_code=400, detail="PublishJob.media_assets is empty")

    # For now, always pretend it published successfully
    published_at = datetime.now(timezone.utc).isoformat()

    response = {
        "status": "published",
        "instagram_media_id": f"stub_{job.post_id}",
        "permalink": f"https://instagram.com/p/stub_{job.post_id}",
        "published_at_utc": published_at,
        "job_id": job.job_id,
        "post_id": job.post_id,
    }

    logger.info(
        f"[AGENT-STUB] Pretending to publish post {job.post_id} "
        f"(job={job.job_id}), media_id={response['instagram_media_id']}"
    )
    return response

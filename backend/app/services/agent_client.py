"""
Agent HTTP client – sends a PublishJob to an external agent endpoint.

In Phase 1 this points to nothing (INSTAGRAM_AGENT_ENDPOINT is unset) so every
call raises AgentPublishError and publish_post_now falls back to internal logic.
"""

import os
import logging
import requests
from ..schemas.publish_job import PublishJob

logger = logging.getLogger(__name__)

# Set INSTAGRAM_AGENT_ENDPOINT in .env to enable the agent path.
# Leave empty (default) to always use the internal instagram_publishing.py fallback.
AGENT_ENDPOINT = os.getenv("INSTAGRAM_AGENT_ENDPOINT", "").rstrip("/")
AGENT_PUBLISH_PATH = "/instagram/publish"


class AgentPublishError(Exception):
    """Raised when the external agent cannot fulfill the publish job."""
    pass


def send_publish_job_to_agent(job: PublishJob) -> dict:
    """
    Send a PublishJob to the external agent endpoint and return its response dict.

    Expected successful response shape:
        {
          "job_id": "...",
          "post_id": 123,
          "status": "published",
          "instagram_media_id": "17890...",
          "permalink": "https://instagram.com/p/..."
        }

    Raises:
        AgentPublishError: If the endpoint is not configured or the call fails.
    """
    if not AGENT_ENDPOINT:
        raise AgentPublishError(
            "INSTAGRAM_AGENT_ENDPOINT is not configured – using internal IG fallback"
        )

    url = f"{AGENT_ENDPOINT}{AGENT_PUBLISH_PATH}"
    logger.info(f"[AGENT] Sending job {job.job_id} for post {job.post_id} to {url}")

    try:
        resp = requests.post(url, json=job.dict(), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        logger.info(
            f"[AGENT] Received response for job {job.job_id}: status={data.get('status')}"
        )
        return data
    except requests.exceptions.RequestException as e:
        logger.error(
            f"[AGENT] ✗ HTTP error sending job {job.job_id} for post {job.post_id}: {e}"
        )
        raise AgentPublishError(str(e))
    except Exception as e:
        logger.error(
            f"[AGENT] ✗ Unexpected error sending job {job.job_id} for post {job.post_id}: {e}"
        )
        raise AgentPublishError(str(e))

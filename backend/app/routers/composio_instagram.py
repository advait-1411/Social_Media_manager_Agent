"""
composio_instagram.py (router) – Single-shot Instagram publish via Composio MCP.

Endpoint:  POST /agent/instagram/composio-post

Required body (JSON):
    { "image_url": "https://...", "caption": "your caption" }

All keys (COMPOSIO_API_KEY, COMPOSIO_MCP_ID, COMPOSIO_USER_ID, INSTAGRAM_USER_ID)
are read from .env — no credentials in the request body.
"""

from fastapi import APIRouter, HTTPException, Request, Body
from ..schemas.composio_instagram import ComposioPostRequest
from ..services.composio_instagram import post_image_via_composio, ComposioError
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/instagram/composio-post")
async def instagram_composio_post(
    request: Request,
    payload: ComposioPostRequest = Body(...),
):
    """
    Accepts image_url + caption → creates Instagram media container via Composio
    → publishes it → returns the combined result.

    No manual steps required between container creation and posting.
    """
    raw = await request.body()
    logger.info(f"[COMPOSIO-ENDPOINT] RAW BODY ({len(raw)} bytes): {raw[:500]}")

    try:
        result = post_image_via_composio(payload)
        return result
    except ComposioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

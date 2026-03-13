"""
composio_instagram.py – Service layer for direct Composio MCP tool calls.

Exact flow (mirrors the two working curl commands):

  Step 1 – INSTAGRAM_CREATE_MEDIA_CONTAINER
    POST to Composio MCP with:
      x-api-key: COMPOSIO_API_KEY (env)
      Accept:    application/json, text/event-stream
      body:      { "arguments": { "image_url": ..., "caption": ... } }
    → SSE response → parse creation_id

  Step 2 – INSTAGRAM_CREATE_POST
    POST to Composio MCP with:
      x-api-key:   COMPOSIO_API_KEY (env)
      Accept:      application/json, text/event-stream
      body:        { "arguments": { "ig_user_id": INSTAGRAM_USER_ID (env), "creation_id": <from step 1> } }
    → SSE response → post live on Instagram

Required .env variables:
    COMPOSIO_API_KEY       – x-api-key header value (ak_...)
    COMPOSIO_MCP_BASE_URL  – defaults to https://backend.composio.dev
    COMPOSIO_MCP_ID        – MCP server UUID
    COMPOSIO_USER_ID       – pg-test user UUID (?user_id= query param)
    INSTAGRAM_USER_ID      – Instagram Business Account ID passed as ig_user_id
"""

import os
import json
import logging
import requests

from ..schemas.composio_instagram import ComposioPostRequest
from ..schemas.publish_job import PublishJob

logger = logging.getLogger(__name__)


# ── Lazy env reader (read at call time — immune to import-order issues) ────────
def _cfg(key: str, default: str = "") -> str:
    return os.getenv(key, default)


# ── Exception ──────────────────────────────────────────────────────────────────
class ComposioError(Exception):
    """Raised when a Composio MCP call fails or is misconfigured."""
    pass


# ── Low-level MCP caller ───────────────────────────────────────────────────────
def _composio_call_tool(api_key: str, tool_name: str, arguments: dict) -> dict:
    """
    Send a JSON-RPC 2.0 tools/call to the Composio MCP endpoint.

    Mirrors the working curl command exactly:
        -H "x-api-key: <api_key>"
        -H "Content-Type: application/json"
        -H "Accept: application/json, text/event-stream"

    The response is SSE-formatted.  We parse every 'data: ...' line looking for
    a valid JSON-RPC object containing 'result' or 'error'.

    Returns the full JSON-RPC response dict  { "jsonrpc":..., "id":..., "result":... }
    """
    mcp_id  = _cfg("COMPOSIO_MCP_ID")
    user_id = _cfg("COMPOSIO_USER_ID")
    base    = _cfg("COMPOSIO_MCP_BASE_URL", "https://backend.composio.dev").rstrip("/")

    if not mcp_id:
        raise ComposioError("COMPOSIO_MCP_ID is not configured in .env")
    if not user_id:
        raise ComposioError("COMPOSIO_USER_ID is not configured in .env")

    url     = f"{base}/v3/mcp/{mcp_id}/mcp"
    params  = {"user_id": user_id}

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    # !! Must match the working curl exactly: both content-types in Accept
    headers = {
        "x-api-key":    api_key,
        "Content-Type": "application/json",
        "Accept":       "application/json, text/event-stream",
    }

    logger.info(f"[COMPOSIO] → {tool_name}  url={url}  args={list(arguments.keys())}")

    try:
        resp = requests.post(url, params=params, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        raw_text = resp.text
        # Log full raw response so we can see exactly what Composio sends back
        logger.info(f"[COMPOSIO] raw response ({len(raw_text)} chars): {raw_text[:1000]}")

        rpc = _parse_sse_response(raw_text, tool_name)
        logger.info(f"[COMPOSIO] ✓ {tool_name} OK")
        return rpc

    except requests.exceptions.RequestException as exc:
        logger.error(f"[COMPOSIO] ✗ {tool_name} HTTP error: {exc}")
        raise ComposioError(str(exc))
    except ComposioError:
        raise
    except Exception as exc:
        logger.error(f"[COMPOSIO] ✗ {tool_name} unexpected error: {exc}")
        raise ComposioError(str(exc))


# ── SSE parser ─────────────────────────────────────────────────────────────────
def _parse_sse_response(raw_text: str, tool_name: str) -> dict:
    """
    Parse the SSE body (text/event-stream) and return the first valid JSON-RPC
    response object found on a 'data: ...' line.

    Raises ComposioError with the full raw body if nothing valid is found.
    """
    for line in raw_text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        data_str = line[len("data:"):].strip()
        if not data_str:
            continue
        try:
            obj = json.loads(data_str)
        except json.JSONDecodeError:
            continue

        if "error" in obj:
            raise ComposioError(
                f"Composio tool {tool_name} returned JSON-RPC error: {obj['error']}"
            )
        if "result" in obj:
            return obj  # { "jsonrpc": "2.0", "id": 1, "result": { ... } }

    raise ComposioError(
        f"[COMPOSIO] No valid JSON-RPC data line found in SSE response for {tool_name}.\n"
        f"Full raw body: {raw_text}"
    )


# ── creation_id extractor ──────────────────────────────────────────────────────
def _extract_id(rpc_response: dict, field_name: str = "id") -> str:
    """
    Pull an ID out of the Composio JSON-RPC response.
    
    This works for both creation_id (Step 1) and media_id (Step 2).

    Composio wraps the Instagram Graph API reply inside result.content[0].text
    as a stringified JSON object.  The Graph API returns { "id": "<creation_id>" }.

    Shapes tried (in order):
      A. rpc["result"]["content"][0]["text"]  → JSON string → parse → "id"   ← most likely
      B. rpc["result"]["data"]["id"]          → Graph API wrapper
      C. rpc["result"]["creation_id"]         → flat key
      D. rpc["result"]["id"]                  → direct id key

    Full raw response is logged and included in the error if nothing matches.
    """
    logger.info(f"[COMPOSIO] _extract_id from: {json.dumps(rpc_response)[:800]}")
    result = rpc_response.get("result", {})

    # Shape A: content[0].text is a stringified JSON
    content = result.get("content") if isinstance(result, dict) else None
    if isinstance(content, list) and content:
        try:
            text = content[0].get("text", "{}")
            parsed = json.loads(text)
            for key in ("id", "creation_id"):
                if key in parsed:
                    logger.info(f"[COMPOSIO] Extracted ID via content[0].text.{key}")
                    return str(parsed[key])
            # Sometimes it's nested under "data"
            if "data" in parsed and "id" in parsed["data"]:
                logger.info("[COMPOSIO] Extracted ID via content[0].text.data.id")
                return str(parsed["data"]["id"])
        except Exception as exc:
            logger.warning(f"[COMPOSIO] content[0].text parse failed: {exc}")

    # Shape B: result.data.id
    if isinstance(result, dict):
        data = result.get("data", {})
        if isinstance(data, dict) and "id" in data:
            logger.info("[COMPOSIO] Extracted ID via result.data.id")
            return str(data["id"])

    # Shape C: result.creation_id (or other flat key)
    if isinstance(result, dict) and field_name in result:
        logger.info(f"[COMPOSIO] Extracted ID via result.{field_name}")
        return str(result[field_name])
    
    # Generic fallback: search for "id" if field_name wasn't it
    if field_name != "id" and isinstance(result, dict) and "id" in result:
        return str(result["id"])

    # Shape D: result.id
    if isinstance(result, dict) and "id" in result:
        logger.info("[COMPOSIO] Extracted ID via result.id")
        return str(result["id"])

    raise ComposioError(
        f"Could not extract {field_name} from Composio response.\n"
        f"Full rpc_response: {json.dumps(rpc_response)}"
    )


# ── High-level orchestrator ────────────────────────────────────────────────────
def post_image_via_composio(req: ComposioPostRequest) -> dict:
    """
    Publish an image to Instagram using the exact same two-step flow as the
    working curl commands.

    Step 1 – INSTAGRAM_CREATE_MEDIA_CONTAINER
        arguments: { image_url, caption }          ← from request body
        → extract creation_id from SSE response

    Step 2 – INSTAGRAM_CREATE_POST
        arguments: { ig_user_id, creation_id }     ← ig_user_id from .env
        → post is live on Instagram

    Returns a dict with: status, creation_id, container_raw, publish_raw
    """
    api_key    = _cfg("COMPOSIO_API_KEY")
    ig_user_id = _cfg("INSTAGRAM_USER_ID")

    if not api_key:
        raise ComposioError("COMPOSIO_API_KEY is not set in .env")
    if not ig_user_id:
        raise ComposioError("INSTAGRAM_USER_ID is not set in .env")

    # ── Step 1: Create media container ─────────────────────────────────────────
    logger.info(f"[COMPOSIO] Step 1 – INSTAGRAM_CREATE_MEDIA_CONTAINER  image_url={req.image_url}")
    container_rpc = _composio_call_tool(
        api_key,
        "INSTAGRAM_CREATE_MEDIA_CONTAINER",
        {
            "image_url": req.image_url,
            "caption":   req.caption,
        },
    )

    creation_id = _extract_id(container_rpc, "creation_id")
    logger.info(f"[COMPOSIO] Step 1 ✓  creation_id={creation_id}")

    # ── Step 2: Publish the container ──────────────────────────────────────────
    logger.info(f"[COMPOSIO] Step 2 – INSTAGRAM_CREATE_POST  ig_user_id={ig_user_id}  creation_id={creation_id}")
    publish_rpc = _composio_call_tool(
        api_key,
        "INSTAGRAM_CREATE_POST",
        {
            "ig_user_id":  ig_user_id,
            "creation_id": creation_id,
        },
    )
    
    # Try to extract the final media ID from Step 2
    media_id = None
    try:
        media_id = _extract_id(publish_rpc, "id")
        logger.info(f"[COMPOSIO] Step 2 ✓  post published, media_id={media_id}")
    except Exception:
        logger.warning("[COMPOSIO] Step 2 OK but could not extract media_id from result. Using creation_id as fallback.")
        media_id = creation_id

    return {
        "status":              "published",
        "instagram_media_id":  media_id,
        "creation_id":         creation_id,
        "container_raw":       container_rpc,
        "publish_raw":         publish_rpc,
    }


# ── Carousel orchestrator ───────────────────────────────────────────────────────

def post_carousel_via_composio(job: PublishJob) -> dict:
    """
    Publish an image carousel to Instagram via Composio.

    Assumes:
      - job.platform == "instagram"
      - job.type == "carousel"
      - len(job.media_assets) >= 2

    Flow:
      1. For each image URL in job.media_assets, call INSTAGRAM_CREATE_MEDIA_CONTAINER
         with is_carousel_item=true to obtain a child creation_id.
      2. Call INSTAGRAM_CREATE_MEDIA_CONTAINER again with media_type=\"CAROUSEL\" and
         children=<child_ids> to create the parent container; include caption.
      3. Call INSTAGRAM_CREATE_POST with ig_user_id + parent creation_id.

    Returns a dict similar to post_image_via_composio:
      {
        \"status\": \"published\" | \"failed\",
        \"instagram_media_id\": ...,
        \"creation_id\": <parent_creation_id>,
        \"children\": [<child_creation_ids>...],
        \"container_raw\": ...,
        \"publish_raw\": ...
      }
    """
    api_key    = _cfg("COMPOSIO_API_KEY")
    ig_user_id = _cfg("INSTAGRAM_USER_ID")

    if not api_key:
        raise ComposioError("COMPOSIO_API_KEY is not set in .env")
    if not ig_user_id:
        raise ComposioError("INSTAGRAM_USER_ID is not set in .env")

    if not job.media_assets or len(job.media_assets) < 2:
        raise ComposioError(
            f"post_carousel_via_composio requires at least 2 media assets; "
            f"got {len(job.media_assets) if job.media_assets else 0}"
        )

    logger.info(
        "[COMPOSIO CAROUSEL] Starting carousel publish for job_id=%s "
        "post_id=%s with %d assets",
        job.job_id,
        job.post_id,
        len(job.media_assets),
    )

    # Step 1 – create child media containers (is_carousel_item = true)
    child_creation_ids: list[str] = []
    for idx, image_url in enumerate(job.media_assets):
        logger.info(
            "[COMPOSIO CAROUSEL] Step 1.%d – INSTAGRAM_CREATE_MEDIA_CONTAINER "
            "for child image_url=%s",
            idx + 1,
            image_url,
        )
        rpc_child = _composio_call_tool(
            api_key,
            "INSTAGRAM_CREATE_MEDIA_CONTAINER",
            {
                "image_url":        image_url,
                "is_carousel_item": True,
            },
        )
        child_id = _extract_id(rpc_child, "creation_id")
        logger.info(
            "[COMPOSIO CAROUSEL] ✓ Child %d created creation_id=%s",
            idx + 1,
            child_id,
        )
        child_creation_ids.append(child_id)

    # Step 2 – create parent CAROUSEL container
    logger.info(
        "[COMPOSIO CAROUSEL] Step 2 – INSTAGRAM_CREATE_MEDIA_CONTAINER "
        "for CAROUSEL parent with %d children",
        len(child_creation_ids),
    )
    rpc_parent = _composio_call_tool(
        api_key,
        "INSTAGRAM_CREATE_MEDIA_CONTAINER",
        {
            "media_type": "CAROUSEL",
            "children":   child_creation_ids,
            "caption":    job.caption,
        },
    )
    parent_creation_id = _extract_id(rpc_parent, "creation_id")
    logger.info(
        "[COMPOSIO CAROUSEL] ✓ Parent carousel container created creation_id=%s",
        parent_creation_id,
    )

    # Step 3 – publish the carousel container
    logger.info(
        "[COMPOSIO CAROUSEL] Step 3 – INSTAGRAM_CREATE_POST ig_user_id=%s "
        "creation_id=%s",
        ig_user_id,
        parent_creation_id,
    )
    rpc_publish = _composio_call_tool(
        api_key,
        "INSTAGRAM_CREATE_POST",
        {
            "ig_user_id":  ig_user_id,
            "creation_id": parent_creation_id,
        },
    )

    media_id = None
    permalink = None
    try:
        media_id = _extract_id(rpc_publish, "id")
        logger.info(
            "[COMPOSIO CAROUSEL] ✓ Carousel published, media_id=%s",
            media_id,
        )
    except Exception:
        logger.warning(
            "[COMPOSIO CAROUSEL] Publish OK but could not extract media_id; "
            "using creation_id=%s as fallback.",
            parent_creation_id,
        )
        media_id = parent_creation_id

    # Try to dig a permalink out of the raw response if present
    try:
        result_obj = rpc_publish.get("result", {})
        if isinstance(result_obj, dict):
            content = result_obj.get("content")
            if isinstance(content, list) and content:
                text = content[0].get("text")
                if text:
                    parsed = json.loads(text)
                    permalink = (
                        parsed.get("permalink")
                        or parsed.get("permalink_url")
                        or (parsed.get("data") or {}).get("permalink")
                    )
    except Exception:
        permalink = None

    return {
        "status":             "published",
        "instagram_media_id": media_id,
        "creation_id":        parent_creation_id,
        "children":           child_creation_ids,
        "permalink":          permalink,
        "container_raw":      rpc_parent,
        "publish_raw":        rpc_publish,
    }


# ── Comment fetching & reply (Composio primary, Graph API fallback) ───────────

def _extract_comments_from_rpc(rpc_response: dict) -> list:
    """
    Extract the comments list from a Composio JSON-RPC response for
    INSTAGRAM_GET_IG_MEDIA_COMMENTS.

    Composio wraps the Graph API reply. Expected shapes:
      - result.content[0].text → JSON string → { "successful": true, "data": { "data": [...] } }
      - result.data → { "data": [...], "paging": {...} }
    """
    result = rpc_response.get("result", {})
    if not isinstance(result, dict):
        return []

    # Shape A: content[0].text is a stringified JSON (Graph API response)
    content = result.get("content")
    if isinstance(content, list) and content:
        try:
            text = content[0].get("text", "{}")
            parsed = json.loads(text)
            
            # Check for inner "data" -> "data" structure (Composio wrapper)
            if "data" in parsed and isinstance(parsed["data"], dict):
                inner_data = parsed["data"].get("data")
                if isinstance(inner_data, list):
                    return inner_data
            
            # Fallback: direct "data" list
            data = parsed.get("data", [])
            if isinstance(data, list):
                return data
                
        except (json.JSONDecodeError, TypeError, KeyError) as exc:
            logger.warning(f"[COMPOSIO COMMENTS] content[0].text parse failed: {exc}")

    # Shape B: result.data
    data = result.get("data")
    if isinstance(data, dict):
        inner = data.get("data", [])
        if isinstance(inner, list):
            return inner
    if isinstance(data, list):
        return data

    return []


async def fetch_comments_via_composio(
    instagram_media_id: str, limit: int = 50
) -> list[dict]:
    """
    Fetch comments for an Instagram media object via Composio MCP.

    Tool: INSTAGRAM_GET_IG_MEDIA_COMMENTS
    Args: ig_media_id, limit

    Returns a normalized list of dicts:
      { "id": str, "text": str, "username": str|None, "timestamp": str|None, "parent_id": str|None }

    On any exception: logs with [COMPOSIO COMMENTS] prefix and raises.
    """
    api_key = _cfg("COMPOSIO_API_KEY")
    if not api_key:
        raise ComposioError("COMPOSIO_API_KEY is not set in .env")

    logger.info(
        "[COMPOSIO COMMENTS] Fetching comments for media_id=%s limit=%d",
        instagram_media_id,
        limit,
    )

    try:
        rpc = _composio_call_tool(
            api_key,
            "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
            {
                "ig_media_id": str(instagram_media_id),
                "limit": limit,
            },
        )
        raw_list = _extract_comments_from_rpc(rpc)

        normalized: list[dict] = []
        for item in raw_list:
            if not isinstance(item, dict):
                continue
            cid = item.get("id")
            if not cid:
                continue
            
            # Extract username from 'username' field or nested 'from' object
            username = item.get("username")
            if not username:
                from_obj = item.get("from")
                if isinstance(from_obj, dict):
                    username = from_obj.get("username")

            normalized.append({
                "id": str(cid),
                "text": item.get("text") or "",
                "username": username,
                "timestamp": item.get("timestamp"),
                "parent_id": item.get("parent_id"),
            })

        logger.info("[COMPOSIO COMMENTS] ✓ Fetched %d comments", len(normalized))
        return normalized

    except ComposioError:
        raise
    except Exception as exc:
        logger.error("[COMPOSIO COMMENTS] ✗ Failed to fetch comments: %s", exc)
        raise ComposioError(str(exc)) from exc


async def reply_to_comment_via_composio(comment_id: str, reply_text: str) -> dict:
    """
    Reply to an Instagram comment via Composio MCP.

    Tool: INSTAGRAM_REPLY_TO_COMMENT
    Args: ig_comment_id, message

    Returns: { "reply_id": str }

    On any exception: logs with [COMPOSIO REPLY] prefix and raises.
    """
    api_key = _cfg("COMPOSIO_API_KEY")
    if not api_key:
        raise ComposioError("COMPOSIO_API_KEY is not set in .env")

    logger.info("[COMPOSIO REPLY] Replying to comment_id=%s", comment_id)

    try:
        rpc = _composio_call_tool(
            api_key,
            "INSTAGRAM_REPLY_TO_COMMENT",
            {
                "ig_comment_id": str(comment_id),
                "message": reply_text,
            },
        )

        reply_id = None
        result = rpc.get("result", {})

        if isinstance(result, dict):
            content = result.get("content")

            if isinstance(content, list) and content:
                # Composio often wraps the tool's response in content[0].text
                try:
                    text = content[0].get("text", "{}")
                    parsed = json.loads(text)
                    logger.info(
                        "[COMPOSIO REPLY] Parsed content[0].text: %s",
                        json.dumps(parsed)[:500],
                    )

                    # Detect inner MCP error shape, e.g.
                    # {"result":{"content":[{"type":"text","text":"MCP error ..."}],"isError":true}, ...}
                    if parsed.get("isError") or (
                        isinstance(parsed.get("result"), dict)
                        and parsed["result"].get("isError")
                    ):
                        raise ComposioError(
                            f"Composio MCP error while replying to comment: {parsed}"
                        )

                    reply_id = parsed.get("id") or (parsed.get("data") or {}).get("id")
                except (json.JSONDecodeError, TypeError, KeyError) as exc:
                    logger.warning(
                        "[COMPOSIO REPLY] Failed to parse content[0].text for reply_id: %s",
                        exc,
                    )

            if not reply_id and "id" in result:
                reply_id = result.get("id")

            if not reply_id:
                data = result.get("data", {})
                if isinstance(data, dict) and "id" in data:
                    reply_id = data.get("id")

        if not reply_id:
            # At this point we treat the Composio call as a failure so that
            # the router can fall back to the Graph API implementation.
            raise ComposioError(
                f"Could not extract reply_id from Composio response: {json.dumps(rpc)[:800]}"
            )

        logger.info("[COMPOSIO REPLY] ✓ Reply posted, reply_id=%s", reply_id)
        return {"reply_id": str(reply_id)}

    except ComposioError:
        # Let callers see this and decide on fallback behaviour.
        raise
    except Exception as exc:
        logger.error("[COMPOSIO REPLY] ✗ Failed to reply: %s", exc)
        raise ComposioError(str(exc)) from exc

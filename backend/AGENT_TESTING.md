# Agent Testing Guide

> **Phase 1 stub** – The local agent endpoint at `POST /agent/instagram/publish`
> simulates a successful Instagram publish without calling Instagram or Composio.
> Phase 2 will replace this stub with the real MCP-based agent.

## Setup

1. Backend running on `http://localhost:8000`
2. `INSTAGRAM_AGENT_ENDPOINT=http://localhost:8000/agent` set in `backend/.env`
3. Restart the backend after any `.env` change

---

## 1 · Direct Agent Stub Test

Sends a `PublishJob` payload straight to the stub.

```bash
curl -X POST http://localhost:8000/agent/instagram/publish \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test-job-123",
    "post_id": 42,
    "platform": "instagram",
    "type": "image",
    "media_assets": ["https://example.com/image.jpg"],
    "caption": "Test caption from curl",
    "hashtags": ["#test", "#curl"],
    "scheduled_time_utc": null,
    "channels": { "instagram_channel_id": "1784_test" },
    "metadata": {}
  }'
```

**Expected response – HTTP 200**

```json
{
  "status": "published",
  "instagram_media_id": "stub_42",
  "permalink": "https://instagram.com/p/stub_42",
  "published_at_utc": "2026-02-25T12:00:00.000000+00:00",
  "job_id": "test-job-123",
  "post_id": 42
}
```

**Expected backend logs**

```
[AGENT-STUB] Received PublishJob test-job-123 for post 42 (type=image)
[AGENT-STUB] Pretending to publish post 42 (job=test-job-123), media_id=stub_42
```

---

## 2 · Validation Failure – Empty media_assets

Verifies the 400-guard is working.

```bash
curl -X POST http://localhost:8000/agent/instagram/publish \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "bad-job",
    "post_id": 99,
    "platform": "instagram",
    "type": "image",
    "media_assets": [],
    "caption": "No media",
    "hashtags": [],
    "scheduled_time_utc": null,
    "channels": { "instagram_channel_id": "1784_test" },
    "metadata": {}
  }'
```

**Expected response – HTTP 400**

```json
{ "detail": "PublishJob.media_assets is empty" }
```

---

## 3 · End-to-End via publish_post_now

Triggers the full path: `POST /api/posts/{id}/publish` → `agent_client` → stub.

**Pre-conditions**

- Post `{id}` exists in the DB with `status = "draft"` and at least one `media_assets` entry.
- `INSTAGRAM_AGENT_ENDPOINT` is set (see Setup above).

```bash
# Replace 123 with a real Post ID
curl -X POST http://localhost:8000/api/posts/123/publish
```

**Expected backend logs (in order)**

```
[AGENT] Sending job <uuid> for post 123 to http://localhost:8000/agent/instagram/publish
[AGENT-STUB] Received PublishJob <uuid> for post 123 (type=image)
[AGENT-STUB] Pretending to publish post 123 (job=<uuid>), media_id=stub_123
[AGENT] Received response for job <uuid>: status=published
[PUBLISH] ✓ Post 123 published via agent (media_id=stub_123)
```

**Expected DB / response state after the call**

| Field | Value |
|---|---|
| `post.status` | `"published"` |
| `post.platform_settings.instagram_media_id` | `"stub_123"` |
| `post.platform_settings.permalink` | `"https://instagram.com/p/stub_123"` |

---

## 4 · Verify Fallback Path (Optional)

To confirm the old `instagram_publishing.py` fallback still works:

1. Temporarily break the agent by setting `INSTAGRAM_AGENT_ENDPOINT=` (empty) in `.env`
2. Restart the backend
3. Run the same curl from §3

**Expected fallback logs**

```
[AGENT] ✗ ... INSTAGRAM_AGENT_ENDPOINT is not configured – using internal IG fallback
[PUBLISH] Falling back to internal IG publishing for post 123
```

Restore `INSTAGRAM_AGENT_ENDPOINT=http://localhost:8000/agent` when done.

---

## 5 · Swagger / Interactive Testing

FastAPI auto-docs are available while the backend is running:

- **Swagger UI** – `http://localhost:8000/docs` → tag **agent-instagram**
- **ReDoc**      – `http://localhost:8000/redoc`

Use the **Try it out** button on `POST /agent/instagram/publish` to test interactively.

---

## Phase Roadmap

| Phase | Agent behaviour |
|---|---|
| **Phase 1 (now)** | Local stub at `/agent/instagram/publish` – always returns `status=published` |
| **Phase 1 (now)** | Real Composio calls at `/agent/instagram/composio-post` – live Instagram publish |
| **Phase 2** | Real MCP-based Composio agent replaces or is pointed to by this stub |

---

## 6 · Composio Live Publish – `/agent/instagram/composio-post`

> This endpoint makes **real Composio MCP calls** and will publish to Instagram.
> `COMPOSIO_API_KEY`, `COMPOSIO_MCP_ID`, `COMPOSIO_USER_ID`, and `INSTAGRAM_USER_ID`
> must all be set in `backend/.env`.

### 6a · Standard usage (key from env)

```bash
curl -X POST "http://localhost:8000/agent/instagram/composio-post" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://iili.io/qKi0vKg.jpg",
    "caption": "Your caption here #hashtag"
  }'
```

**Expected response – HTTP 200**

```json
{
  "status": "published",
  "creation_id": "17865429684589262",
  "container_raw": { "...": "full Composio container response" },
  "publish_raw":   { "...": "full Composio publish response" }
}
```

> **Note:** Actual key paths inside `container_raw` / `publish_raw` depend on the
> Composio response shape. The service tries three known shapes automatically.
> If `creation_id` extraction fails, the error log will print the full raw response
> so you can identify the correct path and update `_extract_creation_id()`.

**Expected backend logs (in order)**

```
[COMPOSIO] → tools/call INSTAGRAM_CREATE_MEDIA_CONTAINER  args=['image_url', 'caption']
[COMPOSIO] ✓ tools/call INSTAGRAM_CREATE_MEDIA_CONTAINER OK
[COMPOSIO] Step 1 OK – creation_id=17865429684589262
[COMPOSIO] → tools/call INSTAGRAM_CREATE_POST  args=['ig_user_id', 'creation_id']
[COMPOSIO] ✓ tools/call INSTAGRAM_CREATE_POST OK
[COMPOSIO] Step 2 OK – post published
```

---

### 6b · Override API key (optional)

```bash
curl -X POST "http://localhost:8000/agent/instagram/composio-post" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://iili.io/qKi0vKg.jpg",
    "caption": "Testing with override key",
    "api_key": "ak_WmJ_HJpg7wtPtBU1VJfA"
  }'
```

Same response shape as 6a. Useful for testing with a different Composio key without
changing `.env`.

---

### 6c · Error cases

| Scenario | HTTP | `detail` |
|---|---|---|
| `COMPOSIO_API_KEY` not set and no override | 502 | `COMPOSIO_API_KEY is not set…` |
| `COMPOSIO_MCP_ID` not set | 502 | `COMPOSIO_MCP_ID is not configured in .env` |
| `INSTAGRAM_USER_ID` not set | 502 | `INSTAGRAM_USER_ID is not set in .env` |
| `image_url` not a valid URL | 422 | FastAPI validation error |
| Composio HTTP error (network / auth) | 502 | upstream error message |
| `creation_id` not found in response | 502 | `Could not extract creation_id…` + raw response |

---

### 6d · Swagger interactive test

`http://localhost:8000/docs` → tag **composio-instagram** →
`POST /agent/instagram/composio-post` → **Try it out**


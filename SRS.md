# Software Requirements Specification (SRS)
## VelvetQueue – AI-Powered Social Media Content Management Agent

---

**Agent ID:** VQ-AGENT-001  
**Agent Name:** VelvetQueue  
**Suite Category:** AI Content Operations / Social Media Automation  

---

## Table of Contents

1. [Project Title](#1-project-title)
2. [Project Overview](#2-project-overview)
3. [Objectives](#3-objectives)
4. [In-Scope](#4-in-scope)
5. [Out-of-Scope](#5-out-of-scope)
6. [Business Scenario with Example](#6-business-scenario-with-example)
7. [Milestones](#7-milestones)
8. [Roles and Responsibilities](#8-roles-and-responsibilities)
9. [Deliverables](#9-deliverables)
10. [Tech Stack](#10-tech-stack)
11. [Functional Requirements](#11-functional-requirements)
12. [Flow Diagram / Architecture Diagram](#12-flow-diagram--architecture-diagram)
13. [Approval Process](#13-approval-process)
14. [Competitive Analysis](#14-competitive-analysis)

---

## 1. Project Title

**VelvetQueue** — AI-Powered Social Media Content Management & Agentic Publishing Platform

---

## 2. Project Overview

VelvetQueue is a full-stack, AI-driven social media content management platform that bridges the gap between AI content generation and end-to-end social media publishing. It empowers marketing teams and content creators to generate brand-aligned visuals, plan multi-platform campaigns using AI, manage and schedule posts, and autonomously publish to Instagram via a Composio MCP agent — all from a single unified interface.

**Problem it solves:**  
Content teams spend excessive time on repetitive tasks: generating on-brand images, writing captions, manually uploading to Instagram, monitoring comment sentiment, and managing approval workflows across disconnected tools.

**Value Delivered:**  
VelvetQueue consolidates the entire content pipeline — from AI generation to scheduled publishing — into one platform, reducing manual effort, enforcing brand consistency, and delivering real-time publishing confidence via agentic automation.

---

## 3. Objectives

| # | Objective | Measurable Outcome |
|---|-----------|-------------------|
| O1 | Automate Instagram image and carousel publishing via Composio MCP | Zero manual browser interaction required for publishing |
| O2 | Enable AI-driven campaign generation from a single prompt | Generate 2–5 multi-post campaign blueprints in < 15 seconds |
| O3 | Apply brand guidelines automatically to all generated visuals | ONIDA logo + AI caption placed on 100% of generated images |
| O4 | Deliver scheduled post publishing with < 60-second accuracy | Scheduler fires within 30s of the target time |
| O5 | Surface AI comment analysis and suggested replies on Instagram posts | Sentiment + category + suggested reply generated for all synced comments |
| O6 | Provide a single API endpoint for create-and-publish flows (single + carousel) | `POST /api/posts/create-and-publish` handles all post types |
| O7 | Maintain a robust fallback publishing path when the primary agent fails | Internal Graph API fallback activated automatically on Composio failure |

---

## 4. In-Scope

### Content Generation
- AI image generation via OpenRouter (Gemini 2.5 Flash) at 2K resolution (2048×2048)
- AI-powered Brand Overlay Engine: automatic ONIDA logo placement and context-aware caption generation using PIL
- Asset Remix ("Style with AI"): AI background generation + alpha-masked product compositing with up to 3 variants
- AI caption and hashtag generation (per-platform: Instagram, LinkedIn, Twitter/X)
- Multi-post AI campaign generation from a free-text prompt

### Content Management
- Asset library management (upload, view, filter, delete, download)
- Draft template system (file-based JSON): create, save, apply, and promote to real posts
- Campaign blueprint system (file-based JSON): generate, review in Kanban canvas, commit to draft posts
- Post CRUD with statuses: `draft`, `pending_approval`, `approved`, `scheduled`, `publishing`, `published`, `rejected`, `failed`

### Publishing
- Manual single-image publish to Instagram via Composio MCP (primary path)
- Manual carousel publish to Instagram via Composio MCP (primary path, ≥ 2 image assets)
- Internal Instagram Graph API fallback for single image and carousels
- Background scheduler for future-dated posts (configurable interval via `.env`)
- Combined create-and-publish endpoint `POST /api/posts/create-and-publish`
- Post scheduling with timezone normalization (IST → UTC)

### Engagement
- Instagram comment sync via Graph API
- AI comment sentiment analysis (positive / neutral / negative) via Azure OpenAI
- AI comment category classification (question / complaint / praise / general)
- AI-suggested reply generation with tone selection (friendly, professional, etc.)
- Direct reply posting back to Instagram from the dashboard

### UI & Real-time
- Multi-platform post composer with live preview (Instagram, LinkedIn, Twitter/X)
- Visual content calendar (weekly grid) and chronological queue
- Real-time post status updates via Socket.io (scheduler → frontend)
- Notification center with unread indicators, toast alerts, and popover history
- Asset Closet modal with scrollable tabs: Generated Images, Drafts, and Campaigns

---

## 5. Out-of-Scope

| Item | Reason |
|------|--------|
| LinkedIn and Twitter/X publishing | Connector UI exists; API integration not yet built |
| Instagram Stories and Reels publishing | Not wired to Composio or Graph API in current scope |
| Full OAuth "Connect Account" UI flow | Channel setup currently requires `.env` configuration |
| Analytics data from platform APIs | Analytics page shows mock data only |
| Multi-tenant / multi-user workspace | Platform is currently single-user/single-brand |
| Team roles and approval workflow (persisted) | Basic router exists; full RBAC and state transitions deferred |
| Brand Kit management (logo/style upload) | ONIDA-specific overlay is hardcoded; generic Brand Kit is future scope |
| Video asset hosting and publishing | Image publishing fully supported; video pipeline deferred |
| Advanced export (PDF reports, calendar export) | Not in current scope |
| Public-facing post engagement tracking (likes, shares) | Real-time metrics from platform APIs deferred |

---

## 6. Business Scenario with Example

### Scenario: Monthly Product Campaign for an E-Commerce Brand

**Actors:**
- **Marketing Manager** (Priya) – plans campaign strategy and approves content
- **Content Creator** (Rahul) – generates and edits posts within VelvetQueue
- **VelvetQueue Agent** – autonomous publisher that handles Composio orchestration

**Context:**  
Priya's brand (ONIDA) is launching a new product range. She needs to publish a 5-post Instagram campaign over one week showcasing lifestyle images and carousel product demonstrations.

**Step-by-step Flow:**

1. **Rahul** opens the **Campaigns page** in VelvetQueue and enters a prompt: *"Launch campaign for ONIDA's new summer ceiling fan range, lifestyle aesthetics, 5 posts"*
2. The AI generates **3 campaign blueprints** with 5 post blueprints each, rendered as a Kanban canvas.
3. Rahul reviews the blueprint captions, edits two of them inline, selects relevant images from the Asset Closet, and clicks **Commit** on 2 campaigns.
4. VelvetQueue creates **10 real Post records** (status: `draft`) in the local SQLite database.
5. Rahul navigates to the **Create Post** page, selects 3 assets for a carousel post, clicks **Schedule**, and sets the time for next Monday 10:00 AM IST.
6. The backend normalizes the time to UTC and saves the post as `scheduled`.
7. On Monday, the **background scheduler** wakes up within 30 seconds, detects the due post, and calls `publish_post_now`.
8. `publish_post_now` builds a `PublishJob` with `type="carousel"`, verifies all 3 assets are images, and calls `post_carousel_via_composio`.
9. The **Composio MCP agent** creates 3 child media containers, a parent CAROUSEL container with caption, and publishes the post to Instagram.
10. The post status updates to `published` in the DB; a **Socket.io event** fires; Priya sees a success toast in her browser in real time.

**Expected Outcome:**  
A fully-produced, brand-aligned Instagram carousel is live on the brand's profile — created, captioned, and published without Priya or Rahul ever opening the Instagram app or Creator Studio.

---

## 7. Milestones

| Day | Milestone | Technical Deliverable |
|-----|-----------|----------------------|
| Day 1 | Backend Foundation | FastAPI app scaffold, SQLAlchemy models (`Post`, `Asset`, `Channel`, `Comment`, `Notification`), SQLite DB init, CORS/Socket.io integration |
| Day 2 | Asset Pipeline | `POST /api/assets/generate` (OpenRouter + PIL Brand Overlay), `POST /api/assets/upload`, `POST /api/assets/{id}/remix`, static file serving for `generated_images/` |
| Day 3 | Post CRUD + Scheduling | Full Post CRUD router, `POST /api/posts/{id}/schedule` with IST→UTC normalization, asyncio background scheduler with `.env`-configurable interval |
| Day 4 | Instagram Publishing (Composio + Fallback) | `composio_instagram.py` (SSE parser, `post_image_via_composio`, `post_carousel_via_composio`), `publish_post_builder.py` type detection, `publish_post_now` with Composio-first routing and internal Graph API fallback |
| Day 5 | Campaigns & Drafts | `POST /api/campaigns/generate` (OpenRouter structured prompt), Kanban canvas frontend, `POST /api/campaigns/{id}/commit`, file-based draft CRUD, `POST /api/posts/create-and-publish` combined endpoint |
| Day 6 | Comments & Engagement | `GET /api/posts/{id}/comments/sync` (Graph API), Azure OpenAI sentiment + category classification, AI reply suggestion, `POST /api/comments/{id}/reply` |
| Day 7 | Frontend Polish + Integration QA | Socket.io real-time status in frontend, Notification Center, Asset Closet scroll fix (Tailwind `min-h-0` + `flex-1`), type-safe API client (`api.ts`), Swagger docs verification, end-to-end curl tests |

---

## 8. Roles and Responsibilities

| Role | Responsibilities |
|------|----------------|
| **AI Engineer** | Design and tune OpenRouter prompts for campaign generation, caption generation, and image description. Integrate Azure OpenAI for comment sentiment and reply suggestion. Maintain Brand Overlay Engine (PIL-based logo placement + caption layout). |
| **Backend Developer** | Build FastAPI routers and services. Design SQLAlchemy models and migrations. Implement background scheduler, `publish_post_now` routing logic, IST/UTC normalization, and all CRUD endpoints. |
| **Integration Engineer** | Wire Composio MCP JSON-RPC calls (`INSTAGRAM_CREATE_MEDIA_CONTAINER`, `INSTAGRAM_CREATE_POST`). Parse SSE responses. Implement `_resolve_public_url` (freeimage.host fallback). Configure `.env` for all external service credentials. |
| **Frontend Developer** | Build Next.js pages (Campaigns, Create, Publish, Assets, Approvals). Implement Asset Closet modal with scrollable tabs. Wire `api.ts` typed client. Integrate Socket.io provider for real-time status updates. |
| **QA Engineer** | Write and execute end-to-end curl/Swagger test cases for all endpoints. Validate Composio carousel flow, fallback activation, scheduler timing, and error handling. Verify toast/notification delivery on publishing events. |

---

## 9. Deliverables

| # | Deliverable | Format |
|---|-------------|--------|
| D1 | FastAPI backend application with all routers, services, and models | Python source code |
| D2 | `composio_instagram.py` – Single-image and carousel Composio MCP orchestration service | Python module |
| D3 | `scheduler.py` – Background asyncio publish worker with Composio-first routing | Python module |
| D4 | `publish_job_builder.py` – PublishJob construction from Post ORM, type detection | Python module |
| D5 | `POST /api/posts/create-and-publish` combined endpoint | FastAPI router |
| D6 | Next.js frontend with all pages, Asset Closet, Campaigns canvas, and Notification Center | TypeScript/React source |
| D7 | `api.ts` – Fully typed frontend API client | TypeScript module |
| D8 | SQLite database schema via SQLAlchemy (`velvet_queue.db`) | Auto-created on startup |
| D9 | `backend/.env.example` with all required environment variable keys documented | Configuration file |
| D10 | `README.md` – Architecture, content lifecycle, setup, and run instructions | Markdown |
| D11 | `Features.md` – Full feature implementation status tracker | Markdown |
| D12 | `SRS.md` – This document | Markdown |
| D13 | Swagger UI endpoint documentation | Auto-generated at `/docs` |
| D14 | `run.bat` / `run.sh` – Cross-platform startup scripts | Shell scripts |

---

## 10. Tech Stack

### Primary Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend Framework | FastAPI (Python 3.10+) | REST API, background tasks, Socket.io host |
| ORM / Database | SQLAlchemy + SQLite (`velvet_queue.db`) | Local data persistence for Posts, Assets, Channels, Comments |
| Frontend Framework | Next.js 14 (App Router) + React 19 | SPA with server/client components |
| Styling | Tailwind CSS + Framer Motion | Utility-first UI with animated transitions |
| Real-time | python-socketio + Socket.io Client | Live post status updates pushed to frontend |
| AI – Images | OpenRouter → Gemini 2.5 Flash | Text-to-image generation at 2K resolution |
| AI – Captions | OpenRouter → `openai/gpt-4o-mini` | Platform-optimized caption and campaign generation |
| AI – Comments | Azure OpenAI | Sentiment analysis, category classification, reply suggestion |
| Image Processing | Pillow (PIL) | Brand overlay engine, alpha-masked asset compositing |
| Agentic Publishing | Composio MCP (JSON-RPC over SSE) | Primary Instagram image and carousel publishing |
| Instagram Fallback | Meta Instagram Graph API v18+ | Fallback single-image and carousel publishing |
| Image Hosting | freeimage.host API | Publicly accessible URLs for locally stored images |
| Type Validation | Pydantic v2 | Request/response schemas, `PublishJob` contract |

### Secondary / Supporting

| Tool | Purpose |
|------|---------|
| `python-dotenv` | `.env` loading at startup |
| `pytz` | IST → UTC timezone normalization |
| `requests` | HTTP calls to Composio, freeimage.host, Graph API |
| `asyncio` | Non-blocking background scheduler |
| `lucide-react` | Icon library |
| `sonner` | Toast notification library |
| `date-fns` | Date formatting utilities |
| `uvicorn` | ASGI server for FastAPI |

---

## 11. Functional Requirements

### 11.1 Input Handling

| ID | Requirement |
|----|-------------|
| FR-I01 | The system MUST accept image generation requests with a text prompt, aspect ratio, and resolution parameters. |
| FR-I02 | The system MUST accept file uploads (images and videos) via multipart form data and persist them locally. |
| FR-I03 | The system MUST accept a free-text campaign prompt and return 2–5 campaign blueprints with 3–10 post blueprints each. |
| FR-I04 | The system MUST accept a `PostCreate` body (content, media_assets, channels, scheduled_time, platform_settings) for all post creation endpoints. |
| FR-I05 | The `POST /api/posts/{id}/schedule` endpoint MUST accept a naive datetime, assume IST timezone, and normalize to UTC before storage. |
| FR-I06 | The `POST /api/campaigns/{id}/commit` endpoint MUST accept `blueprint_ids: List[str]` and `default_status: str` and reject empty `blueprint_ids` with a `400` error. |

### 11.2 Processing Logic

| ID | Requirement |
|----|-------------|
| FR-P01 | `publish_post_now` MUST check if a post is already `published` (idempotency guard) before any external call. |
| FR-P02 | `publish_post_now` MUST build a `PublishJob` from the `Post` using `build_publish_job_from_post`, resolving all asset file paths to public URLs. |
| FR-P03 | If `PublishJob.type == "carousel"` and all `media_assets` are of `asset_type == "image"`, the system MUST attempt `post_carousel_via_composio` as the primary path. |
| FR-P04 | If `PublishJob.type == "image"` and `len(media_assets) == 1`, the system MUST attempt `post_image_via_composio` as the primary path. |
| FR-P05 | On any `ComposioError` or unexpected exception from the Composio path, the system MUST log the error and fall through to the internal Instagram Graph API path without raising to the caller. |
| FR-P06 | The carousel Composio flow MUST create individual child containers (`is_carousel_item=True`) for each image, then a parent `CAROUSEL` container with caption, then call `INSTAGRAM_CREATE_POST` — in that exact order. |
| FR-P07 | The background scheduler MUST query for `Post` records with `status IN ("scheduled", "approved")` and `scheduled_time <= now (UTC)` on every tick. |
| FR-P08 | The scheduler MUST mark a post as `publishing` before calling `publish_post_now` to prevent double-processing across ticks. |
| FR-P09 | The Brand Overlay Engine MUST use AI to determine logo position (corner) and generate a one-line minimalist caption before compositing onto the image. |
| FR-P10 | Asset Remix MUST generate an AI background image, extract the original product using alpha masking, and composite them into up to 3 variants linked via `parent_id`. |

### 11.3 Integrations

| ID | Requirement |
|----|-------------|
| FR-INT01 | Composio MCP calls MUST use `x-api-key` header, `Content-Type: application/json`, and `Accept: application/json, text/event-stream` — matching the exact SSE flow documented in `composio_instagram.py`. |
| FR-INT02 | The system MUST parse SSE (`text/event-stream`) responses from Composio by scanning `data:` lines for a valid JSON-RPC object with `result` or `error`. |
| FR-INT03 | The `_resolve_public_url` helper MUST upload locally stored images to `freeimage.host` when `PUBLIC_BASE_URL` is `localhost` or not set to a public domain. |
| FR-INT04 | Comment sync MUST call the Instagram Graph API to fetch comments and run each through Azure OpenAI for sentiment and category classification in a single batch. |
| FR-INT05 | All Composio tool calls MUST use the `COMPOSIO_MCP_ID`, `COMPOSIO_USER_ID`, and `COMPOSIO_API_KEY` values read from environment at call time (lazy env reading, not at module import). |

### 11.4 Outputs

| ID | Requirement |
|----|-------------|
| FR-O01 | `POST /api/posts/create-and-publish` MUST return `{ id, message, status, media_id }`. If publishing fails, it MUST still return `200` with `status: "draft"` and the error detail in `"error"` field. |
| FR-O02 | All post status transitions MUST emit a `post_status` Socket.io event with `{ id, status, title, message }` to the connected frontend clients. |
| FR-O03 | Successful Composio publishes MUST persist `instagram_media_id` (and `permalink` if available) into `Post.platform_settings`. |
| FR-O04 | Failed publish attempts MUST set `Post.status = "failed"`, `Post.last_error = error_message`, and create a `Notification` record of `type="error"`. |
| FR-O05 | The Swagger UI at `/docs` MUST document all endpoints with correct request/response schemas. |

### 11.5 Error Handling

| ID | Requirement |
|----|-------------|
| FR-E01 | `ComposioError` raised in Composio service functions MUST be caught at the `publish_post_now` level and MUST NOT propagate to the HTTP response as a 500 error if a fallback path exists. |
| FR-E02 | Instagram access token expiry errors MUST be surfaced with a human-readable fix message directing the user to regenerate their token. |
| FR-E03 | Missing required `.env` variables for Composio or Instagram MUST raise descriptive `ComposioError` or `Exception` messages before any external API call is made. |
| FR-E04 | If `build_publish_job_from_post` fails (e.g., asset not found), the error MUST propagate and the post MUST be marked `failed`. |
| FR-E05 | Per-post failures in the scheduler MUST be caught individually so that one failed post does not block processing of subsequent due posts in the same tick. |

---

## 12. Flow Diagram / Architecture Diagram

### 12.1 Written Flow Description

**Content Creation Flow:**
```
User (Frontend)
  │
  ├── Enters prompt → POST /api/campaigns/generate
  │     └── OpenRouter (gpt-4o-mini) → Campaign Blueprints (JSON files in /campaigns/)
  │           └── User reviews Kanban → clicks "Commit"
  │                 └── POST /api/campaigns/{id}/commit
  │                       └── Creates Post rows (status=draft) in velvet_queue.db
  │
  ├── Uploads / generates image → POST /api/assets/generate or /upload
  │     └── Gemini 2.5 Flash via OpenRouter → saves to /generated_images/
  │           └── PIL Brand Overlay Engine → ONIDA logo + caption composited
  │                 └── Asset record saved to DB
  │
  └── Selects assets, writes caption → POST /api/posts/{id}/schedule
        └── Normalizes time IST → UTC → Post status = "scheduled"
```

**Publishing Flow (Composio Primary + Internal Fallback):**
```
Trigger: Scheduler tick (every 30s) OR manual POST /api/posts/{id}/publish
                                  OR POST /api/posts/create-and-publish
  │
  ├── publish_post_now(db, post)
  │     │
  │     ├── IDEMPOTENCY CHECK: already published? → return early
  │     ├── build_publish_job_from_post → PublishJob { type, media_assets (URLs), caption, ... }
  │     │
  │     ├── platform == "instagram"?
  │     │     │
  │     │     ├── type == "image", assets == 1?
  │     │     │     └── post_image_via_composio(req)
  │     │     │           ├── Step 1: INSTAGRAM_CREATE_MEDIA_CONTAINER (image_url, caption)
  │     │     │           │     └── SSE parse → creation_id
  │     │     │           └── Step 2: INSTAGRAM_CREATE_POST (ig_user_id, creation_id)
  │     │     │                 └── SSE parse → media_id → status = "published" ✓
  │     │     │
  │     │     ├── type == "carousel", assets >= 2, all images?
  │     │     │     └── post_carousel_via_composio(job)
  │     │     │           ├── For each image: INSTAGRAM_CREATE_MEDIA_CONTAINER (is_carousel_item=True)
  │     │     │           │     └── child creation_ids collected
  │     │     │           ├── INSTAGRAM_CREATE_MEDIA_CONTAINER (CAROUSEL, children, caption)
  │     │     │           │     └── parent creation_id
  │     │     │           └── INSTAGRAM_CREATE_POST (ig_user_id, parent_creation_id)
  │     │     │                 └── media_id → status = "published" ✓
  │     │     │
  │     │     └── ComposioError / type mismatch / non-image assets?
  │     │           └── [FALLBACK] internal instagram_publishing.py
  │     │                 ├── Single image: post_to_instagram(url, caption, user_id, token)
  │     │                 └── Carousel: post_carousel_to_instagram(urls, caption, user_id, token)
  │     │
  │     └── SUCCESS: Post.status = "published", platform_settings.instagram_media_id saved
  │         OR FAILURE: Post.status = "failed", last_error saved, Notification created
  │
  └── Socket.io event "post_status" → Frontend toast + Notification Center update
```

### 12.2 Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                     Browser (Next.js Frontend)                     │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Campaigns│  │ Create Post│  │  Publish  │  │    Assets     │  │
│  │  Canvas  │  │ + Composer │  │ Calendar  │  │    Closet     │  │
│  └────┬─────┘  └─────┬──────┘  └─────┬─────┘  └──────┬────────┘  │
│       │               │               │                │           │
│       └───────────────┴───────────────┴────────────────┘          │
│                         api.ts (typed fetch wrapper)               │
└────────────────────────────┬──────────────────────────────────────┘
                              │ HTTP/REST + WebSocket (Socket.io)
┌────────────────────────────▼──────────────────────────────────────┐
│                    FastAPI Backend (Port 8000)                      │
│                                                                     │
│  ┌─────────────┐  ┌────────────┐  ┌───────────┐  ┌────────────┐  │
│  │  /api/posts │  │/api/assets │  │/api/       │  │/api/       │  │
│  │  (CRUD,     │  │(gen,upload │  │campaigns  │  │comments    │  │
│  │  schedule,  │  │,remix,     │  │(generate, │  │(sync, AI,  │  │
│  │  publish,   │  │overlay)    │  │commit)    │  │reply)      │  │
│  │ create-and- │  └─────┬──────┘  └────┬──────┘  └─────┬──────┘  │
│  │ publish)    │        │               │                │         │
│  └──────┬──────┘        │               │                │         │
│         │               │               │                │         │
│  ┌──────▼───────────────▼───────────────▼────────────────▼──────┐ │
│  │              Core Services                                     │ │
│  │  scheduler.py │ publish_job_builder.py │ composio_instagram.py│ │
│  │  image_gen.py │ ai_assistant.py        │ instagram_publishing │ │
│  └──────┬────────────────────┬────────────────────┬─────────────┘ │
│         │                    │                    │                │
│  ┌──────▼──────┐    ┌────────▼────────┐  ┌───────▼──────────┐   │
│  │  SQLite DB  │    │  /generated_    │  │  python-socketio  │   │
│  │velvet_queue │    │  images/  +     │  │  (real-time       │   │
│  │   .db       │    │ /campaigns/ +   │  │   events)         │   │
│  │Post, Asset  │    │ /drafts/ (JSON) │  └───────────────────┘   │
│  │Channel etc. │    └─────────────────┘                           │
│  └─────────────┘                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                       │
┌─────────▼────────┐  ┌──────────▼──────────┐  ┌───────▼──────────┐
│  Composio MCP    │  │   OpenRouter API     │  │  Azure OpenAI    │
│  (JSON-RPC/SSE)  │  │  Gemini 2.5 Flash   │  │  (Comment AI)    │
│  Primary publish │  │  GPT-4o-mini         │  │                  │
│  path (Instagram)│  │  (Images, Captions,  │  └──────────────────┘
└─────────┬────────┘  │   Campaigns)         │
          │           └──────────────────────┘
┌─────────▼────────┐
│  Meta Instagram  │  ← Fallback path only
│  Graph API v18+  │
└──────────────────┘
```

---

## 13. Approval Process

### 13.1 Stakeholders and Approvers

| Role | Name / Title | Responsibility |
|------|-------------|----------------|
| Product Owner | TBD | Validates scope, objectives, and business scenario |
| Tech Lead / Backend Engineer | VelvetQueue Core Dev | Validates functional requirements, architecture, and tech stack |
| Integration Engineer | Composio / API Lead | Validates Composio MCP flow, Instagram Graph API integration |
| QA Lead | QA Engineer | Validates testability of functional requirements and milestones |
| Client / Sponsor | ONIDA Brand Stakeholder | Final sign-off on feature scope and brand alignment |

### 13.2 Review Stages

**Initial Review (Internal – Tech Team)**  
Tech team validates functional requirements, architecture accuracy, service dependencies, and completeness of the tech stack. Any ambiguous or missing requirements are flagged with specific line references in this document.

**Stakeholder Review (Business)**  
Business stakeholders validate the scope, objectives, business scenario, and out-of-scope items. Confirm that brand guardrails (ONIDA overlay, AI content restrictions) are sufficiently specified.

**Final Approval (Client / Sponsor)**  
The client provides formal sign-off on the complete SRS document, confirming alignment with business goals and authorizing development to proceed against this baseline.

### 13.3 Approval Criteria

- All functional requirements (Section 11) are clear, complete, and individually testable
- Architecture diagram (Section 12) accurately reflects the current implemented system
- Milestones in Section 7 map to buildable, testable deliverables within the 7-day timeline
- Scope boundaries (Sections 4 & 5) are mutually agreed upon by all parties
- Tech stack (Section 10) is confirmed as available and accessible in the deployment environment
- All out-of-scope items are acknowledged and deferral rationale is accepted

### 13.4 Sign-Off Process

- Written or digital sign-off is obtained from each approver listed in Section 13.1
- Signed SRS is tagged as version `v1.0-baseline` in the repository
- The approved version is locked and becomes the development baseline
- Any post-approval changes (scope additions, integration changes, architectural shifts) trigger a re-review cycle with all original approvers

### 13.5 Approval Timeline

| Day | Activity |
|-----|----------|
| Day 1–2 | Internal tech team review: validate FR, architecture, and tech stack |
| Day 2–3 | Stakeholder feedback, revisions to scope / business scenario |
| Day 3 | Final sign-off from all approvers; SRS baseline locked as `v1.0` |

---

## 14. Competitive Analysis

| Product | Publisher URL | How It's Built | Key Differentiators | How VelvetQueue Compares |
|---------|--------------|----------------|---------------------|--------------------------|
| **Buffer** | [buffer.com](https://buffer.com) | SaaS platform; REST API integrations with social platforms; no AI generation; manual media upload | Simple scheduling UI, multi-platform queue, team collaboration | VelvetQueue adds AI image generation, brand overlays, and agentic publishing via Composio. Buffer has no in-app content generation. |
| **Hootsuite** | [hootsuite.com](https://hootsuite.com) | Enterprise SaaS; platform APIs; basic AI caption suggestions via OwlyWriter AI; team workflows | Large team approval workflows, analytics, social listening | Hootsuite's AI is limited to captions; VelvetQueue generates full campaigns, brand-overlaid images, and publishes via an agent — not just a scheduler. |
| **Later** | [later.com](https://later.com) | Visual content calendar; Instagram API direct publish; media library; link-in-bio; no AI generation | Best-in-class visual calendar, hashtag suggestions, link-in-bio | Later excels at visual planning but lacks AI campaign generation, image generation, and agentic Composio-based publishing. VelvetQueue is more AI-native. |
| **Metricool** | [metricool.com](https://metricool.com) | SaaS; multi-platform API integration; analytics heavy; basic AI writing assistant | Strong analytics, competitor tracking, multi-network auto-publishing | Metricool is analytics-first. VelvetQueue prioritizes AI-generated content pipelines and agentic automation over analytics (analytics is currently mock data). |
| **ContentStudio** | [contentstudio.io](https://contentstudio.io) | SaaS; OpenAI-powered AI writer; Canva integration; RSS automation; approval workflows | AI content curation, team collaboration, approval flows | ContentStudio uses OpenAI for text but not for image generation; no brand overlay engine. VelvetQueue's carousel + Composio flow + PIL Brand Engine is not replicated by ContentStudio. |
| **Sprout Social** | [sproutsocial.com](https://sproutsocial.com) | Enterprise SaaS; deep social listening, CRM integration; AI suggestions | Enterprise-grade inbox, social CRM, deep analytics | Sprout is enterprise-tier with pricing to match. VelvetQueue is a self-hosted, developer-owned platform with a tighter scope but full control over the AI and publishing pipeline. |

### VelvetQueue Unique Differentiators

1. **Agentic Publishing via Composio MCP**: Unlike all competitors, VelvetQueue uses a JSON-RPC MCP agent (Composio) as the primary posting path, not a direct API call. This separates publishing concerns from the application layer and allows the agent to evolve independently.
2. **AI Brand Overlay Engine**: No competitor offers PIL-based brand logo placement + AI-planned minimalist caption compositing in the content creation flow.
3. **Single-Endpoint Create + Publish**: `POST /api/posts/create-and-publish` allows programmatic or testing workflows where content creation and publishing are a single atomic operation, unique to VelvetQueue's API design.
4. **Self-Hosted + Open Stack**: VelvetQueue runs locally with SQLite, no cloud vendor lock-in, and full access to the publishing pipeline — making it ideal for teams that require data sovereignty or custom integrations.
5. **Campaign Blueprint → Commit → Publish Lifecycle**: The structured campaign → draft → post pipeline with file-based blueprints and DB-backed posts gives content teams a clear, auditable lifecycle not found in most SaaS tools.

---

**Document Version:** v1.0  
**Last Updated:** March 10, 2026  
**Based on:** VelvetQueue codebase (branch: main), full implementation as of March 2026 sprint.

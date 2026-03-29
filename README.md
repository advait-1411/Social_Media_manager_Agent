# VelvetQueue - Social Media Content Management Platform

VelvetQueue is a high-performance, full-stack social media content management platform. It empowers users to generate AI-powered assets, craft professional posts with AI-assisted captions, edit media with an integrated suite, and manage complex publishing schedules across multiple platforms (Instagram, LinkedIn, Twitter/X).

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Content Lifecycle: From Campaign to Post](#content-lifecycle-from-campaign-to-post)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [How to Run](#how-to-run)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Technologies Used](#technologies-used)

## Overview

VelvetQueue bridges the gap between AI generation and social media management:

- **AI Image Generation**: Creates visuals via **OpenRouter** using image-capable models (default **`google/gemini-3-pro-image-preview`**). The service **retries with an ordered fallback list** (e.g. Gemini 3.1 Flash Image, GPT-5 Image Mini, Gemini 2.5 Flash Image) if a model refuses or errors. An **overlay pipeline** uses the active **Brand Kit**’s light logo path (when present) plus an AI-planned caption placement from `ai_assistant`. Prompts are built with `build_remix_prompt()` from the kit’s `system_prompt` and the user’s text (no separate hardcoded prompt constant in the router).
- **Campaign Kanban Canvas**: Generate full multi-platform content campaigns (2–5 strategies, each with 3–10 post blueprints) from a single prompt. Review in an interactive Kanban board, edit captions, swap assets, and bulk-commit to drafts. Includes AI-suggested posting cadences.
- **Draft Library & Scheduled Feed**: Manage your content pipeline with a dedicated Drafts store and a real-time Scheduled Feed. Supports JSON-based draft templates for portability.
- **AI-Powered Analytics Dashboard**: Metrics computed on the client from **`GET /api/posts/`** and **`GET /api/assets/`** — post volume, status mix, platform distribution, and asset utilization using **`meta_data.source`** (`generated`, `upload`, `remix`, etc.) with date-range filters (7d / 30d / All).
- **Interactive Live Previews**: Responsive, platform-accurate previews for Instagram, LinkedIn, and Twitter/X. Carousel navigation (arrows + indicators) updates as you compose.
- **AI Caption & Comment Assistant**: Platform-optimized captions and AI-suggested replies for Instagram comments, with **Composio MCP** and Instagram Graph API fallbacks where applicable.
- **Agentic Publishing (Composio MCP)**: Multi-asset publishing for Instagram (single, carousel, reels) with internal orchestration and Graph API fallbacks.
- **Background Scheduling**: `scheduler.py` runs due posts on a configurable interval (`SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_SECONDS`).
- **Real-time Synchronization**: Post status updates and navbar notifications via Socket.io.
- **Brand Kits & Asset Management**: Multi-brand support with `system_prompt`, light/dark logo uploads, and kit-scoped asset filtering. When **`brand_kit_id` is omitted**, the backend uses the kit marked **`is_default=True`** in the database (API create sets new kits to non-default unless you align the DB).
- **Visual Content Calendar**: Weekly grid or chronological queue for scheduled content.
- **Notification Center**: Navbar bell with toast alerts and persistent history.

## Content Lifecycle: From Campaign to Post

VelvetQueue uses a multi-stage lifecycle from AI generation to publishing.

### 1. Campaigns & Blueprints (File-Based)
When you **Generate Campaigns**, the AI creates **Campaign Blueprints**.

- **Storage:** JSON files under `backend/campaigns/`.
- **Nature:** Ideas/templates; not in SQL until committed.
- **Commit:** Promotes selected blueprints into **`posts`** rows with status `draft`.

### 2. Draft Templates (File-Based)
**Save as Template** in the composer writes reusable drafts.

- **Storage:** JSON files under `backend/drafts/`.
- **Usage:** **Asset Closet → Drafts**; **Apply** loads the composer; saving from there creates or updates DB posts.

### 3. Posts (Database-Backed)
SQLite (`velvet_queue.db`) is the source of truth for publishable content.

- **`draft`**: Committed from campaigns or saved from the composer.
- **`scheduled`**: Has `scheduled_time`; picked up by the scheduler.
- **`published`**: Successfully sent to a platform (e.g. Instagram).

### Flow Summary
1. **AI Generation** → Campaign JSON (blueprints)
2. **Commit Campaign** → DB `Post` (`draft`)
3. **Save as Template** → Draft JSON
4. **Apply Template** → Composer → DB `Post` (`draft`)
5. **Schedule / Publish** → `scheduled` → `published`

## Architecture

Three-tier layout with real-time updates:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                  │
│  - React 19 / App Router                                  │
│  - Tailwind CSS 4 / Framer Motion                        │
│  - Socket.io Client, BulkJobProvider (global AI jobs)    │
│  - Port: 3000                                             │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API / WebSocket
┌────────────────────▼────────────────────────────────────┐
│              Backend API (FastAPI)                     │
│  - Python 3.10+ / SQLAlchemy (SQLite)                   │
│  - Scheduler (asyncio)                                  │
│  - Socket.io (python-socketio)                           │
│  - Static mounts: /generated_images, /brand_kit_logos    │
│  - Port: 8000                                           │
└────────────────────┬────────────────────────────────────┘
         ┌───────────┴────────────────┐
         │                            │
┌────────▼───────┐     ┌──────────────▼──────────────────┐
│  External APIs │     │       Publishing Layer           │
│ - OpenRouter   │     │  PublishJob (Composio + fallback)│
└────────────────┘     └─────────────────────────────────┘
```

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI, CORS, static mounts, scheduler startup, DB migrate hook
│   │   ├── database.py
│   │   ├── models/models.py     # Post, Asset, BrandKit, Channel, Comment, Notification, …
│   │   ├── routers/
│   │   │   ├── assets.py        # Generate, upload, list, remix (composite)
│   │   │   ├── posts.py         # CRUD, schedule, publish, bulk variations, batch-create
│   │   │   ├── brand_kits.py    # Brand kit CRUD + logo uploads
│   │   │   ├── campaigns.py, drafts.py, comments.py, ai.py, …
│   │   │   ├── composio_instagram.py, agent_instagram.py
│   │   │   └── approvals.py     # API for approval workflow (UI may still use mock data)
│   │   └── services/
│   │       ├── image_gen.py     # OpenRouter image gen + overlays + model fallbacks
│   │       ├── prompt_builder.py # build_remix_prompt(user, system_prompt)
│   │       ├── composio_instagram.py, agent_client.py, instagram_publishing.py, scheduler.py
│   │       └── ai_assistant.py  # Captions, overlay plan, etc.
│   ├── generated_images/        # Served at /generated_images
│   ├── brand_kit_logos/         # Served at /brand_kit_logos
│   ├── campaigns/, drafts/      # File-based blueprints / templates
│   ├── tests/                   # e.g. image_gen model tests
│   └── requirements.txt
├── frontend/
│   ├── app/                     # App Router: assets, create, publish, campaigns, analytics, settings, …
│   ├── components/              # layout-shell, modals, socket-provider, …
│   ├── contexts/bulk-job-context.tsx  # Long-running bulk generation outside page lifecycle
│   ├── lib/api.ts
│   └── package.json
├── run.bat / run.sh
├── Features.md
└── README.md
```

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Instagram Professional account** (for production publishing; dev can run without)
- **API keys**: OpenRouter; Composio + Instagram credentials as documented in `.env`

## Installation & Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```
Create `backend/.env` with the variables below (there is no committed `.env.example` in-repo; copy from your secrets manager).

### Frontend
```bash
cd frontend
npm install
```

## Environment Variables (`backend/.env`)

Core values:

| Variable | Purpose |
| -------- | ------- |
| `OPENROUTER_API_KEY` | Image generation and LLM calls via OpenRouter |
| `OPENROUTER_SITE_URL` | Optional; HTTP-Referer header (default `http://localhost:3000`) |
| `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_ENDPOINT` | Comment sentiment / classification where used |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` | Graph API and fallbacks |
| `COMPOSIO_API_KEY`, `COMPOSIO_MCP_ID`, `COMPOSIO_USER_ID` | Composio MCP tools |
| `COMPOSIO_MCP_BASE_URL` | Default `https://backend.composio.dev` |
| `SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_SECONDS` | Background publisher |
| `INSTAGRAM_AGENT_ENDPOINT` | Agent base URL if you use the agent routes |

## How to Run

**Windows:** `run.bat`  
**Linux/macOS:** `./run.sh`

Starts backend (8000) and frontend (3000) with dependency checks as implemented in the scripts.

## API Documentation

- **Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Technologies Used

- **Backend:** FastAPI, SQLAlchemy, SQLite, python-socketio, Pillow, requests
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Framer Motion, Sonner, Socket.io client, date-fns
- **AI:** OpenRouter (image + text models), optional Azure OpenAI for comment analysis

## License

Copyright © 2026 VelvetQueue. For inquiries or collaboration, see the project repository.

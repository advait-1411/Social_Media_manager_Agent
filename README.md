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

VelvetQueue bridge the gap between AI generation and social media management:

- **AI Image Generation**: Create stunning visuals using Gemini 2.5 Flash via OpenRouter. Includes an **AI-powered Brand Overlay Engine** that automatically places the ONIDA logo and generates context-aware minimalist captions based on the scene.
- **Asset Remix (Style with AI)**: Transform existing product photos into professional lifestyle shots. Generates an AI background from a prompt and composites the original product on top with clean alpha-masking.
- **Campaign Generator**: Generate full multi-platform content campaigns (2–5 strategies, each with 3–10 post blueprints) from a single prompt. Review in a Kanban canvas, edit captions, and commit to draft posts in bulk.
- **Draft Library**: Save and manage post templates as JSON files, allowing for easy promotion to real posts across multiple platforms.
- **AI Caption & Comment Assistant**: Generate platform-optimized captions and AI-suggested replies for Instagram comments based on sentiment analysis (Azure OpenAI), backed by **Composio MCP + Instagram Graph API fallback** for fetching and replying to real comments.
- **Agentic Publishing (Composio MCP)**: Tiered publishing strategy using **Composio MCP** as the primary path for Instagram (single image + carousels + reels), with a robust internal Graph API fallback. Includes a Phase 1 testing stub for end-to-end verification.
- **Background Scheduling**: A resilient background worker (`scheduler.py`) manages future post executions with configurable intervals.
- **Real-time Synchronization**: Post status updates and navbar notifications pushed instantly via Socket.io.
- **Brand Kits & Asset Management**: Multi-brand support with dedicated system prompts, logo management (light/dark versions), and brand-specific asset filtering.
- **Visual Content Calendar**: Manage your entire social strategy in a weekly grid or chronological queue.
- **Notification Center**: Integrated navbar bell with toast alerts and persistent history popover.

## Content Lifecycle: From Campaign to Post

VelvetQueue uses a multi-stage lifecycle to manage content from initial AI generation to final social media publishing.

### 1. Campaigns & Blueprints (File-Based)
When you **Generate Campaigns**, the AI creates a set of **Campaign Blueprints**. 
- **Storage:** These are stored as **JSON files** in the `backend/campaigns/` directory.
- **Nature:** They are "ideas" or "templates." They don't exist in your SQL database yet.
- **The 'Commit' Button:** Clicking **Commit** on a campaign column takes those selected blueprints and **promotes** them. It creates real rows in the `posts` table of your local SQLite database with a status of `draft`.

### 2. Draft Templates (File-Based)
When you are in the **Create New Post** composer and click **Save as Template**, you are creating a reusable draft.
- **Storage:** These are stored as **JSON files** in the `backend/drafts/` directory.
- **Purpose:** These act as a "library" of content you might want to reuse later. They are accessible via the **Asset Closet → Drafts** tab.
- **Promotion:** When you select a draft from the Asset Closet and click **Apply**, it loads that content into your composer. If you then "Commit" or "Save" from there, it becomes a real database `Post`.

### 3. Posts (Database-Backed)
The `posts` table in your local SQLite database (`velvet_queue.db`) is the "source of truth" for anything that is actually going to be published.
- **Status: `draft`**: A post that has been committed from a campaign or saved from the composer. It's in the database but not yet scheduled.
- **Status: `scheduled`**: A post that has a `scheduled_time` and is waiting for the background worker to publish it.
- **Status: `published`**: A post that has successfully been sent to a social media platform.

### Flow Summary
1. **AI Generation** → `Campaign JSON` (Blueprints)
2. **Commit Campaign** → `Database Post` (Status: `draft`)
3. **Save as Template** → `Draft JSON` (Reusable Template)
4. **Apply Template** → `Composer` → `Database Post` (Status: `draft`)
5. **Schedule/Publish** → `Database Post` (Status: `scheduled` → `published`)

## Architecture

The application follows a modern **three-tier architecture** with real-time event-driven updates:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  - React 19 / App Router                                 │
│  - Tailwind CSS / Framer Motion                          │
│  - Socket.io Client for real-time notifications          │
│  - Port: 3000                                            │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API / WebSocket
┌────────────────────▼────────────────────────────────────┐
│              Backend API (FastAPI)                       │
│  - Python 3.10+ / SQLAlchemy ORM (SQLite)                │
│  - Async Background Scheduler (Asyncio)                  │
│  - Socket.io Server (python-socketio)                    │
│  - Port: 8000                                            │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴────────────────┐
         │                            │
┌────────▼───────┐     ┌──────────────▼──────────────────┐
│  External APIs │     │       Publishing Layer           │
│ - OpenRouter   │     │  PublishJob (agent + fallback)   │
│ - AI Provider  │     │                                  │
│ - Media Hosting│     │  ┌─────────────────────────────┐ │
└────────────────┘     │  │  Composio Instagram Agent   │ │
                       │  │  (INSTAGRAM_AGENT_ENDPOINT) │ │
                       │  └──────────┬──────────────────┘ │
                       │             │ fallback if unset   │
                       │  ┌──────────▼──────────────────┐ │
                       │  │  Internal Instagram Graph   │ │
                       │  │  API (instagram_publishing) │ │
                       │  └─────────────────────────────┘ │
                       └─────────────────────────────────┘
```

## Project Structure

```
.
├── backend/                    # Core FastAPI Application
│   ├── app/
│   │   ├── main.py            # App entry point with Socket.io & Middleware
│   │   ├── database.py         # SQLAlchemy & SQLite configuration
│   │   ├── models/
│   │   │   └── models.py       # DB Models: Post, Asset, Channel, Comment, etc.
│   │   ├── routers/                # Domain-specific API handlers
│   │   │   ├── ai.py               # AI Completion (Captions, Tags)
│   │   │   ├── assets.py           # Asset Management, Generation & Remix
│   │   │   ├── posts.py            # Post CRUD, Schedule, and Manual Publish
│   │   │   ├── comments.py         # Instagram Comment sync, AI Analysis, and replies (Composio MCP + Graph API fallback)
│   │   │   ├── campaigns.py        # Campaign Generator & Commit logic
│   │   │   ├── drafts.py           # Draft Library management
│   │   │   ├── brand_kits.py       # Brand Kit CRUD (Logos, Prompts, Assets)
│   │   │   ├── agent_instagram.py  # Agentic publishing stubs
│   │   │   └── composio_instagram.py # (if exposed as router, testing hooks)
│   │   └── services/               # Core Business Logic
│   │       ├── scheduler.py         # Background task for due posts
│   │       ├── image_gen.py         # AI Prompting & PIL Brand Overlay Engine
│   │       ├── ai_assistant.py      # OpenRouter/Azure OpenAI logic
│   │       ├── instagram_publishing.py # Instagram Graph API logic (fallback path)
│   │       ├── composio_instagram.py   # Composio MCP integration for Instagram posts, carousels, and comments
│   │       └── agent_client.py         # PublishJob + agent orchestration (Composio-first, fallback to internal)
│   ├── generated_images/      # Local object storage for generated media
│   ├── brand_kit_logos/       # Storage for brand light/dark logos
│   ├── campaigns/             # File-based storage for campaign blueprints
│   ├── drafts/                # File-based storage for post drafts
│   └── requirements.txt       # Backend dependencies
│
├── frontend/                   # Next.js Application
│   ├── app/                   # App Router Pages
│   │   ├── campaigns/         # Campaign Generator & Canvas
│   │   ├── assets/            # Manage images/videos
│   │   ├── create/            # Compose & Edit posts
│   │   ├── publish/           # Calendar & Queue view
│   │   └── settings/          # Channel & Account Management
│   ├── components/            # Shared UI Components
│   │   ├── image-editor-modal.tsx  # In-app media editor
│   │   ├── schedule-modal.tsx      # Date/Time selector
│   │   ├── notifications-popover.tsx # Navbar notification history
│   │   └── socket-provider.tsx     # Real-time event wrapper
│   ├── lib/                   # API clients and utilities
│   │   └── api.ts             # Typed axios/fetch wrapper (incl. campaignsApi)
│   └── package.json           # Frontend dependencies
│
├── CAMPAIGNS_TESTING_GUIDE.md # Testing guide for Campaign Generator feature
├── run.bat / run.sh           # Cross-platform startup scripts
├── Features.md                # Detailed implementation status roadmap
└── README.md                  # This file
```

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Active Instagram Professional Account** (linked to a Facebook Page)
- **API Keys**: OpenRouter, Azure OpenAI (or similar), and Instagram App Credentials.

## Installation & Setup

### 1. Backend Configuration
Navigate to `backend/`, copy the example environment file, and populate your keys:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend Configuration
Navigate to `frontend/` and install dependencies:
```bash
cd frontend
npm install
```

### 3. Environment Variables (`backend/.env`)
Ensure the following are set for core functionality:

- `OPENROUTER_API_KEY`: For image generation and captions.
- `AZURE_OPENAI_API_KEY` & `AZURE_OPENAI_ENDPOINT`: For comment sentiment analysis.
- `INSTAGRAM_ACCESS_TOKEN` & `INSTAGRAM_USER_ID`: For publishing and comments via the Instagram Graph API (also used as underlying credentials for some Composio flows).
- `COMPOSIO_API_KEY`: For agentic publishing and comment operations via Composio MCP.
- `COMPOSIO_MCP_BASE_URL`: Base URL for the Composio MCP backend (default: `https://backend.composio.dev`).
- `COMPOSIO_MCP_ID`: MCP server UUID for your Composio Instagram agent.
- `COMPOSIO_USER_ID`: Composio user identifier passed as `user_id` query param for tools/call.
- `SCHEDULER_ENABLED`: Set to `true` to enable background posting.
- `INSTAGRAM_AGENT_ENDPOINT`: URL of the agent endpoint (e.g., `http://localhost:8000/agent`).

## How to Run

### The All-in-One Command
VelvetQueue provides a master script that handles dependencies, port cleanup, and simultaneous server startup.

**For Windows:**
```cmd
run.bat
```

**For Linux/Mac:**
```bash
./run.sh
```

## API Documentation

Once the backend is running, you can explore the interactive API docs at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Technologies Used

- **Frameworks**: FastAPI (Backend), Next.js (Frontend)
- **Styling**: Tailwind CSS, Framer Motion
- **Database**: SQLite (SQLAlchemy ORM)
- **Real-time**: Socket.io (python-socketio)
- **AI Integration**: OpenRouter (Images), Gemini/Azure OpenAI (Captions)
- **Utility**: Lucide React (Icons), Sonner (Toasts), date-fns

## License

Copyright © 2026 VelvetQueue. For inquiries or collaboration, please refer to the project repository.

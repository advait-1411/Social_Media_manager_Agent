# VelvetQueue - B2B Social Media Content Pipeline

VelvetQueue is a premium, full-stack social media management platform pivoted for B2B product marketing. It empowers brands to manage **Product Kits**, generate high-fidelity AI assets via a guided **AI Mode** chat, and publish professional multi-platform content with automated brand safety overlays.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Content Lifecycle: Guided AI Mode](#content-lifecycle-guided-ai-mode)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [How to Run](#how-to-run)
- [API Documentation](#api-documentation)
- [Technologies Used](#technologies-used)

## Overview

VelvetQueue bridges the gap between raw AI generation and professional brand consistency:

- **AI Mode (Guided Chat)**: A next-generation creation interface in `/create`. Users can tag specific product assets (e.g., `@hero-shot`) to guide the AI. The system automatically infers the **Product Kit**, loads the correct **Product Guidelines**, and generates scene-accurate visuals.
- **B2B Product Kits**: Replaces traditional brand kits with typed asset management.
    - **Product Assets**: Reference images used to condition AI generation.
    - **Logos & Trademarks**: Strictly reserved for post-generation overlay (never seen by the AI).
- **Automated Overlay Pipeline**: Professional brand placement is handled by a dedicated `OverlayService`. It applies logos and trademarks to generated images post-inference, ensuring perfect brand reproduction that AI models often struggle to replicate.
- **Brand Safety (LOGO_SAFETY_RULE)**: Enforces that legal trademarks never enter the "black box" of image generation, preserving brand integrity.
- **Campaign Kanban Canvas**: Generate multi-platform content campaigns from a single prompt, review in an interactive Kanban board, and bulk-commit to drafts.
- **AI-Powered Analytics**: Real-time metrics on post volume, status mix, and asset utilization calculated directly from live database data.

## Content Lifecycle: Guided AI Mode

VelvetQueue uses a strict pipeline to ensure quality and brand safety.

### 1. Product Kit Configuration (Settings)
Upload your product catalog. Distinguish between **Product Assets** (which the AI "sees" to understand your product) and **Logos** (which are overlaid later). Define **Product Guidelines** as visual constraints.

### 2. AI Mode Chat (Create)
Describe your post in the AI Mode chat. Tag your assets with `@`.
- **Inference**: The AI resolves tags to specific assets.
- **Generation**: Visuals are generated using OpenRouter (Gemini/GPT-5 fallbacks) conditioned on your Product Assets and Guidelines.
- **Overlay**: If a logo was specified or inferred, it is composited onto the result automatically.

### 3. Composer & Multi-Platform Preview
Add your captions (which are clean of visual hallucinations thanks to separated prompts). Review pixel-perfect previews for Instagram, LinkedIn, and Twitter/X before scheduling.

### 4. Publishing & Scheduling
The `scheduler.py` background worker handles the actual dispatching to social networks via **Composio MCP**.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)                  │
│  - AI Mode Chat / Asset Tagging Interface                 │
│  - Tailwind CSS 4 UI / Lightbox Previews                 │
│  - Socket.io Client for real-time job status              │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API / WebSocket
┌────────────────────▼────────────────────────────────────┐
│              Backend API (FastAPI)                     │
│  - Tag Parser & Kit Inference Engine                      │
│  - Overlay Service (PIL-based compositing)                │
│  - SQLite (SQLAlchemy) + Cascade File Cleanup             │
│  - Port: 8000                                           │
└────────────────────┬────────────────────────────────────┘
         ┌───────────┴────────────────┐
         │                            │
┌────────▼───────┐     ┌──────────────▼──────────────────┐
│  AI Engine     │     │       Publishing Layer           │
│ - OpenRouter   │     │ - Composio MCP                   │
│ - Safe Prompter│     │ - Scheduler                      │
└────────────────┘     └─────────────────────────────────┘
```

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── posts.py         # AI Mode orchestration & publishing
│   │   │   ├── brand_kits.py    # Product Kit CRUD & Cascade Delete
│   │   │   └── assets.py        # Typed asset uploads & list
│   │   └── services/
│   │       ├── tag_parser.py    # @tag mention resolver
│   │       ├── overlay_service.py # Brand logo compositor
│   │       └── image_gen.py     # OpenRouter image generation
│   ├── brand_kit_logos/         # Typed asset storage
│   └── generated_images/        # AI output storage
├── frontend/
│   ├── app/
│   │   ├── create/              # AI Mode & Composer
│   │   ├── settings/            # Product Kit Manager
│   │   └── analytics/           # Live Data Dashboard
│   └── lib/api.ts               # Typed API client
└── Features.md                  # Detailed implementation status
```

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **OpenRouter API Key** (for generation)
- **Composio API Key** (for publishing)

## Installation & Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

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

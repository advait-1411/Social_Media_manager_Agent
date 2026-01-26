# VelvetQueue - Social Media Content Management Platform

VelvetQueue is a full-stack social media content management platform that enables users to generate AI-powered images, create posts, and publish them to multiple social media platforms (Instagram, LinkedIn, Twitter/X). The platform features an intuitive web interface for managing assets, creating content, and scheduling posts.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [How to Run](#how-to-run)
- [Workflow](#workflow)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Technologies Used](#technologies-used)

## Overview

VelvetQueue provides a complete solution for social media content creation and publishing:

- **AI Image Generation**: Generate images using AI models (Gemini 2.5 Flash via OpenRouter)
- **Asset Management**: Organize and manage generated/uploaded images in an asset closet
- **Post Creation**: Create posts with captions, media, and multi-platform support
- **AI-Powered Captions**: Generate and repurpose captions using Azure OpenAI
- **Scheduling**: Schedule posts for future publication
- **Multi-Platform Publishing**: Publish to Instagram, LinkedIn, and Twitter/X
- **Content Calendar**: Visual calendar view for managing scheduled content

## Architecture

The application follows a **three-tier architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  - React 19 with TypeScript                              │
│  - Tailwind CSS for styling                              │
│  - Framer Motion for animations                          │
│  - Port: 3000                                            │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼────────────────────────────────────┐
│              Backend API (FastAPI)                       │
│  - Python 3.10+                                         │
│  - SQLAlchemy ORM with SQLite                           │
│  - RESTful API endpoints                                 │
│  - Port: 8000                                            │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐      ┌─────────▼──────────┐
│  External APIs │      │  Instagram Backend │
│  - OpenRouter  │      │  (Legacy/Standalone)│
│  - Azure OpenAI│      │  Port: 8000         │
│  - Freeimage.host│    │  (Optional)         │
└────────────────┘      └─────────────────────┘
```

### Data Flow

1. **User generates image** → Frontend → Backend API → OpenRouter → Image saved to `generated_images/` → Database entry created
2. **User creates post** → Frontend → Backend API → Post saved to database
3. **User publishes post** → Frontend → Backend API → Instagram API (via `insta_backend` or direct API) → Post published

## Project Structure

```
full_IG_post/
├── backend/                    # Main FastAPI backend application
│   ├── app/
│   │   ├── main.py            # FastAPI app initialization, CORS, routers
│   │   ├── database.py         # SQLAlchemy database setup (SQLite)
│   │   ├── models/
│   │   │   └── models.py       # Database models (Asset, Channel, Post)
│   │   ├── routers/           # API route handlers
│   │   │   ├── ai.py          # AI assistant endpoints (captions, hashtags)
│   │   │   ├── assets.py      # Asset management (generate, upload, list)
│   │   │   ├── connectors.py  # Social media channel connections
│   │   │   └── posts.py        # Post CRUD and publishing
│   │   └── services/          # Business logic services
│   │       ├── ai_assistant.py # Azure OpenAI integration for captions
│   │       ├── image_gen.py    # OpenRouter image generation service
│   │       └── instagram_publishing.py  # Instagram API integration
│   ├── generated_images/      # Storage for AI-generated images
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment variables (not in repo)
│   └── velvet_queue.db        # SQLite database file
│
├── frontend/                   # Next.js frontend application
│   ├── app/                   # Next.js App Router pages
│   │   ├── page.tsx           # Home/dashboard page
│   │   ├── assets/            # Asset management page
│   │   │   └── page.tsx
│   │   ├── create/            # Post creation page
│   │   │   └── page.tsx
│   │   ├── publish/           # Publishing/scheduling page
│   │   │   └── page.tsx
│   │   ├── analytics/         # Analytics page (placeholder)
│   │   ├── approvals/         # Approval workflow page (placeholder)
│   │   └── settings/          # Settings page (placeholder)
│   ├── components/            # Reusable React components
│   │   └── layout-shell.tsx   # Main layout wrapper
│   ├── lib/                   # Utility functions
│   │   └── utils.ts           # Helper functions (cn, etc.)
│   ├── package.json           # Node.js dependencies
│   └── tsconfig.json          # TypeScript configuration
│
├── insta_backend/             # Standalone Instagram publishing service
│   ├── main.py                # FastAPI app for Instagram posting
│   ├── image_gen.py           # Image generation router
│   ├── complete_post_pipeline.py  # Full automation script
│   ├── confirmation_layer.py  # User confirmation prompts
│   ├── diagnose_token.py      # Token validation utility
│   ├── generated_images/      # Generated images storage
│   ├── hosted_images.json     # Mapping of local images to hosted URLs
│   └── requirements.txt       # Python dependencies
│
├── temp_buffer_ui/            # Temporary/experimental UI components
│   └── jest.config.js         # Jest configuration
│
├── run.sh                     # Bash script to run both frontend and backend
└── README.md                  # This file
```

### Module Descriptions

#### Backend (`backend/`)

- **`app/main.py`**: FastAPI application entry point. Sets up CORS, mounts static files, includes routers.
- **`app/database.py`**: SQLAlchemy database configuration. Creates engine, session factory, and base class.
- **`app/models/models.py`**: Database models:
  - `Asset`: Stores image/video assets with metadata (prompt, tags, file path)
  - `Channel`: Social media platform connections (Instagram, LinkedIn, etc.)
  - `Post`: Post content with status, scheduled time, media assets, and platform settings
- **`app/routers/`**: API route handlers:
  - `ai.py`: AI assistant endpoints (caption generation, repurposing, hashtag suggestions)
  - `assets.py`: Asset CRUD operations, image generation, file uploads
  - `connectors.py`: Social media channel management (connect, list channels)
  - `posts.py`: Post management (create, read, update, publish)
- **`app/services/`**: Business logic:
  - `ai_assistant.py`: Azure OpenAI integration for generating/repurposing captions
  - `image_gen.py`: OpenRouter API integration for AI image generation
  - `instagram_publishing.py`: Instagram Graph API integration for posting

#### Frontend (`frontend/`)

- **`app/page.tsx`**: Home page with navigation to main features
- **`app/assets/page.tsx`**: Asset management interface - generate images, view asset closet
- **`app/create/page.tsx`**: Post composer with multi-platform support and live preview
- **`app/publish/page.tsx`**: Publishing calendar and queue management
- **`components/layout-shell.tsx`**: Shared layout component with navigation

#### Instagram Backend (`insta_backend/`)

- **`main.py`**: Standalone FastAPI service for Instagram posting (can run independently)
- **`complete_post_pipeline.py`**: End-to-end automation script (generate → rename → upload → post)
- **`image_gen.py`**: Image generation router (similar to backend service)
- **`confirmation_layer.py`**: Interactive confirmation prompts for automation
- **`diagnose_token.py`**: Utility to validate Instagram access tokens

## Prerequisites

- **Python 3.10+** (for backend)
- **Node.js 18+** and **npm** (for frontend)
- **Git** (for cloning the repository)

### API Keys Required

- **OpenRouter API Key** (for AI image generation)
- **Azure OpenAI** credentials (for caption generation):
  - `AZURE_OPENAI_ENDPOINT`
  - `AZURE_OPENAI_API_KEY`
  - `AZURE_OPENAI_DEPLOYMENT_NAME`
- **Instagram API** credentials (for publishing):
  - `INSTAGRAM_USER_ID`
  - `INSTAGRAM_ACCESS_TOKEN`
- **Freeimage.host API Key** (optional, for image hosting)

## Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd full_IG_post
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env  # If exists, or create manually
```

Edit `backend/.env` with your API keys:

```env
OPENROUTER_API_KEY=your_openrouter_key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_DEPLOYMENT_NAME=MMNext-gpt-4o
AZURE_OPENAI_API_VERSION=2025-01-01-preview
INSTAGRAM_USER_ID=your_instagram_user_id
INSTAGRAM_ACCESS_TOKEN=your_long_lived_token
INSTAGRAM_API_VERSION=v21.0
FREEIMAGE_HOST_API_KEY=6d207e02198a847aa98d0a27a  # Optional default
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Instagram Backend Setup (Optional)

If you want to use the standalone Instagram service:

```bash
cd insta_backend
pip install -r requirements.txt
```

## How to Run

### Option 1: Using the Run Script (Recommended)

**For Linux/Mac/Git Bash/WSL:**
```bash
# Make script executable (Linux/Mac)
chmod +x run.sh

# Run the script
./run.sh
```

**For Windows (Native):**
```batch
# Double-click run.bat or run from Command Prompt
run.bat
```

The run scripts will:
- ✅ Check for required dependencies (Python, Node.js, npm)
- ✅ Install frontend dependencies if needed
- ✅ Create Python virtual environment if needed
- ✅ Install backend dependencies if needed
- ✅ Kill any existing processes on ports 3000 and 8000
- ✅ Start both backend and frontend servers
- ✅ Display status and URLs
- ✅ Handle cleanup on Ctrl+C (bash) or window close (batch)

**Note:** On Windows, if you prefer using Git Bash or WSL, you can use `run.sh` instead of `run.bat`.

### Option 2: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
python3 -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Option 3: Standalone Instagram Backend (Optional)

If you want to run the Instagram publishing service separately:

```bash
cd insta_backend
python3 -m uvicorn main:app --reload --port 8080
```

### Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs (Swagger UI)
- **Instagram Backend** (if running): http://localhost:8080

## Workflow

### 1. Generate Assets

1. Navigate to **Assets** page (`/assets`)
2. Enter a prompt describing the image you want
3. Click **Generate** (generates 4 images by default)
4. Images are saved to `backend/generated_images/` and stored in database
5. View generated images in the asset grid

### 2. Create a Post

1. Navigate to **Create** page (`/create`)
2. Select target platforms (Instagram, LinkedIn, Twitter)
3. Write or generate a caption:
   - Use AI Assistant to generate captions
   - Repurpose captions for different platforms
   - Add hashtags
4. Select media from asset closet
5. Preview post in real-time (platform-specific previews)
6. Save as draft or publish immediately

### 3. Publish/Schedule

1. Navigate to **Publish** page (`/publish`)
2. View scheduled posts in calendar or list view
3. Schedule posts for future publication
4. Publish posts immediately or manage the queue

### 4. Complete Automation Pipeline (via `insta_backend`)

The `complete_post_pipeline.py` script automates the entire process:

```bash
cd insta_backend
python complete_post_pipeline.py "Your image prompt here"
```

This script:
1. Generates an image from the prompt
2. Renames the image file
3. Uploads to Freeimage.host (for public URL)
4. Posts to Instagram with generated caption
5. Includes confirmation prompts for safety

## API Endpoints

### Assets (`/api/assets`)

- `GET /api/assets/` - List all assets
- `POST /api/assets/generate` - Generate images from prompt
- `POST /api/assets/upload` - Upload image file

### Posts (`/api/posts`)

- `GET /api/posts/` - List all posts (optional `?status=draft`)
- `GET /api/posts/{post_id}` - Get specific post
- `POST /api/posts/` - Create new post
- `PUT /api/posts/{post_id}` - Update post
- `POST /api/posts/{post_id}/publish` - Publish post to Instagram

### AI Assistant (`/api/ai`)

- `POST /api/ai/generate-caption` - Generate caption from prompt
- `POST /api/ai/repurpose` - Repurpose caption for different platform
- `POST /api/ai/hashtags` - Suggest hashtags for content

### Connectors (`/api/connectors`)

- `GET /api/connectors/` - List connected social media channels
- `POST /api/connectors/connect` - Connect new channel

### Instagram Backend (`insta_backend`)

- `POST /post-image` - Post image to Instagram
- `POST /image/generate-image` - Generate image
- `POST /upload-to-host` - Upload image to hosting service
- `GET /health` - Health check with credentials validation
- `GET /validate-token` - Validate Instagram access token

## Environment Variables

### Backend (`backend/.env`)

```env
# Image Generation
OPENROUTER_API_KEY=your_key_here

# AI Captions
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_API_KEY=your_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=MMNext-gpt-4o
AZURE_OPENAI_API_VERSION=2025-01-01-preview

# Instagram Publishing
INSTAGRAM_USER_ID=your_user_id
INSTAGRAM_ACCESS_TOKEN=your_long_lived_token
INSTAGRAM_API_VERSION=v21.0

# Image Hosting (Optional)
FREEIMAGE_HOST_API_KEY=your_key_here

# Server Configuration
PORT=8000
PUBLIC_BASE_URL=https://your-ngrok-url.com  # For localhost tunneling
```

### Instagram Backend (`insta_backend/.env`)

Same variables as backend, plus any additional Instagram-specific settings.

## Technologies Used

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: ORM for database operations
- **SQLite**: Lightweight database (can be upgraded to PostgreSQL)
- **Uvicorn**: ASGI server
- **Pillow (PIL)**: Image processing
- **OpenAI (Azure)**: AI caption generation
- **OpenRouter**: AI image generation API
- **Requests**: HTTP client for external APIs

### Frontend
- **Next.js 16**: React framework with App Router
- **React 19**: UI library
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library
- **Lucide React**: Icon library
- **date-fns**: Date manipulation utilities

### Database
- **SQLite**: File-based database (default)
- Models: Asset, Channel, Post

## Development Notes

- The backend uses SQLite by default. For production, consider PostgreSQL.
- CORS is currently set to allow all origins (`*`) for development. Restrict in production.
- Images are stored locally in `generated_images/`. For production, use cloud storage (S3, etc.).
- Instagram API requires publicly accessible HTTPS URLs. Use ngrok or similar for localhost development.
- The `insta_backend` folder contains a standalone Instagram service that can be used independently.

## Troubleshooting

### Backend won't start
- Check Python version: `python3 --version` (needs 3.10+)
- Verify dependencies: `pip install -r requirements.txt`
- Check port 8000 is not in use: `lsof -ti:8000` (Linux/Mac) or `netstat -ano | findstr :8000` (Windows)

### Frontend won't start
- Check Node.js version: `node --version` (needs 18+)
- Clear cache: `rm -rf node_modules .next && npm install`
- Check port 3000 is not in use

### Image generation fails
- Verify `OPENROUTER_API_KEY` is set in `.env`
- Check API quota/limits on OpenRouter
- Review backend logs for error messages

### Instagram posting fails
- Verify `INSTAGRAM_ACCESS_TOKEN` is a valid long-lived token
- Check token has required permissions: `instagram_basic`, `pages_show_list`, `instagram_content_publish`
- Ensure image URL is publicly accessible (HTTPS)
- Use `/validate-token` endpoint to diagnose token issues

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

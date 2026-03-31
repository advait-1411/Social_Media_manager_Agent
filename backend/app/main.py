import os
import logging
from dotenv import load_dotenv

# !! Load .env FIRST – before any local imports that call os.getenv() at module level
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import socketio
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .database import engine, Base
from .routers import assets, connectors, posts, ai, comments, profile, approvals, notifications, campaigns, drafts, agent_instagram, composio_instagram, brand_kits

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
    ]
)


# Create tables (additive — new tables like kit_assets are created automatically)
Base.metadata.create_all(bind=engine)

# Auto-migrate: Add brand_kit_id to assets if it doesn't exist
try:
    with engine.connect() as conn:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        # --- assets.brand_kit_id migration (existing) ---
        columns = [c['name'] for c in inspector.get_columns('assets')]
        if 'brand_kit_id' not in columns:
            logging.info("[MIGRATION] Adding 'brand_kit_id' column to 'assets' table...")
            conn.execute(text("ALTER TABLE assets ADD COLUMN brand_kit_id INTEGER REFERENCES brand_kits(id);"))
            conn.commit()
            logging.info("[MIGRATION] Successfully added 'brand_kit_id' column.")
except Exception as e:
    logging.error(f"[MIGRATION] Migration failed: {e}")

# Create storage directories on startup
os.makedirs("brand_kit_logos", exist_ok=True)
os.makedirs("kit_assets", exist_ok=True)

app = FastAPI(title="VelvetQueue API", version="1.0.0")

# SocketIO integration is handled at the end
from .socket_manager import socket_manager

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount generated images for frontend access
os.makedirs("generated_images", exist_ok=True)
app.mount("/generated_images", StaticFiles(directory="generated_images"), name="generated_images")

# Mount brand kit logos for frontend access
app.mount("/brand_kit_logos", StaticFiles(directory="brand_kit_logos"), name="brand_kit_logos")



# Routers
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["Connectors"])
app.include_router(posts.router, prefix="/api/posts", tags=["Posts"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI Assistant"])
app.include_router(comments.router, prefix="/api", tags=["Comments"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(approvals.router, prefix="/api", tags=["Approvals"])
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["Campaigns"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(agent_instagram.router, prefix="/agent", tags=["agent-instagram"])
app.include_router(composio_instagram.router, prefix="/agent", tags=["composio-instagram"])
app.include_router(brand_kits.router, prefix="/api/brand-kits", tags=["Brand Kits"])
# B2B terminology alias: /api/product-kits routes to the same router
app.include_router(brand_kits.router, prefix="/api/product-kits", tags=["Product Kits"])

# Mount kit assets directory
os.makedirs("kit_assets", exist_ok=True)
try:
    app.mount("/kit_assets", StaticFiles(directory="kit_assets"), name="kit_assets")
except Exception:
    pass  # Directory might already be mounted


@app.on_event("startup")
async def startup_event():
    """Initialize background services on startup"""
    from .services.scheduler import start_scheduler

    # Read scheduler configuration
    enabled_str = os.getenv("SCHEDULER_ENABLED", "true").lower()
    enabled = enabled_str in ["true", "1", "yes"]
    interval_seconds = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "30"))
    
    if enabled:
        start_scheduler(app, interval_seconds=interval_seconds)
        logging.info(f"[STARTUP] Scheduler service started (interval: {interval_seconds}s)")
    else:
        logging.info("[STARTUP] Scheduler service disabled (SCHEDULER_ENABLED=false)")


@app.get("/")
def read_root():
    return {"message": "VelvetQueue Backend is Live"}

# Wrap FastAPI with SocketIO
app = socketio.ASGIApp(socket_manager.sio, other_asgi_app=app)

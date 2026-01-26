from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import assets, connectors, posts, ai, comments
import os
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
    ]
)

# Load environment variables
load_dotenv()

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VelvetQueue API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount generated images for frontend access
os.makedirs("generated_images", exist_ok=True)
app.mount("/generated_images", StaticFiles(directory="generated_images"), name="generated_images")

# Routers
app.include_router(assets.router, prefix="/api/assets", tags=["Assets"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["Connectors"])
app.include_router(posts.router, prefix="/api/posts", tags=["Posts"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI Assistant"])
app.include_router(comments.router, prefix="/api", tags=["Comments"])

@app.get("/")
def read_root():
    return {"message": "VelvetQueue Backend is Live"}

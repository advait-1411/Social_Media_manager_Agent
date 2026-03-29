import os
import asyncio
import logging
import sys
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).parent.parent
sys.path.append(str(backend_dir))

# Mock get_image_overlay_plan to avoid extra AI calls
from unittest.mock import AsyncMock, patch

import dotenv
dotenv.load_dotenv(backend_dir / ".env")

from app.services.image_gen import generate_images_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_models():
    # List of models we implemented as fallbacks
    models = [
        "google/gemini-3-pro-image-preview",
        "google/gemini-3.1-flash-image-preview",
        "openai/gpt-5-image-mini",
        "google/gemini-2.5-flash-image"
    ]
    
    prompt = "A futuristic sneaker for Nike, professional studio photography, cinematic lighting, 8k resolution"
    
    # We mock get_image_overlay_plan to simplify
    with patch("app.services.image_gen.get_image_overlay_plan", new_callable=AsyncMock) as mock_overlay:
        mock_overlay.return_value = {
            "logo_position": "BOTTOM-RIGHT-CORNER", 
            "caption_text": "JUST DO IT", 
            "caption_position": "TOP-CENTER"
        }
        
        for model in models:
            print(f"\n--- Testing model: {model} ---")
            try:
                # We only want 1 image for testing
                paths = await generate_images_service(prompt, count=1, model=model)
                if paths:
                    print(f"SUCCESS: Generated {len(paths)} images for {model}")
                    print(f"Path: {paths[0]}")
                else:
                    print(f"FAILURE: No paths returned for {model}")
            except Exception as e:
                print(f"ERROR with {model}: {e}")

if __name__ == "__main__":
    if not os.getenv("OPENROUTER_API_KEY"):
        print("ERROR: OPENROUTER_API_KEY not found in .env")
        sys.exit(1)
    
    asyncio.run(test_models())

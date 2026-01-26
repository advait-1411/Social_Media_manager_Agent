import os
import uuid
from datetime import datetime
import requests
import base64
from io import BytesIO
from PIL import Image
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

async def generate_images_service(prompt: str, count: int = 1, model: str = "google/gemini-2.5-flash-image"):
    """
    Generates images using OpenRouter API with Gemini 2.5 Flash Image model.
    """
    generated_paths = []
    output_dir = "generated_images"
    os.makedirs(output_dir, exist_ok=True)
    
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not found. Falling back to mock generation for testing.")
        # Fallback to mock if no key (so app doesn't crash during dev without keys)
        import random
        from PIL import ImageDraw
        for i in range(count):
            color = (random.randint(50, 200), random.randint(50, 200), random.randint(50, 200))
            img = Image.new('RGB', (1024, 1024), color=color)
            d = ImageDraw.Draw(img)
            d.text((50, 50), f"Mock: {model}", fill=(255, 255, 255))
            d.text((50, 70), prompt[:50], fill=(255, 255, 255))
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            filename = f"mock_{timestamp}_{unique_id}_{i}.jpg"
            path = os.path.join(output_dir, filename)
            img.save(path)
            generated_paths.append(f"generated_images/{filename}")
        return generated_paths

    # Sanitize API key
    api_key = api_key.strip().strip('"').strip("'")
    
    api_url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
        "X-Title": "VelvetQueue"
    }

    for i in range(count):
        try:
            # Prepare payload with image_config for Gemini model
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "image_config": {
                    "aspect_ratio": "1:1",  # Square for social media
                    "image_size": "2K"
                }
            }
            
            logger.info(f"Generating image {i+1}/{count} with prompt: {prompt[:50]}...")
            response = requests.post(api_url, json=payload, headers=headers, timeout=120)
            response.raise_for_status()
            data = response.json()
            
            # Extract image from response structure
            # Gemini 2.5 Flash Image returns: data['choices'][0]['message']['images'][0]['image_url']['url']
            image_data_url = None
            try:
                if 'choices' in data and len(data['choices']) > 0:
                    message = data['choices'][0].get('message', {})
                    if 'images' in message and len(message['images']) > 0:
                        image_data_url = message['images'][0]['image_url']['url']
            except (KeyError, IndexError, TypeError) as e:
                logger.error(f"Failed to extract image URL from response: {e}")
                logger.error(f"Response structure: {data}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to extract image from API response: {str(e)}"
                )
            
            if not image_data_url:
                logger.error(f"No image URL found in response: {data}")
                raise HTTPException(
                    status_code=500,
                    detail="API response did not contain an image URL"
                )

            # Download and decode image
            if image_data_url.startswith("data:image/"):
                # Base64 encoded image
                base64_data = image_data_url.split(",")[1]
                img_data = base64.b64decode(base64_data)
            else:
                # URL - download the image
                img_resp = requests.get(image_data_url, timeout=60)
                img_resp.raise_for_status()
                img_data = img_resp.content

            # Generate unique filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            filename = f"gen_{timestamp}_{unique_id}_{i}.jpg"
            file_path = os.path.join(output_dir, filename)

            # Process and save image
            image = Image.open(BytesIO(img_data))
            
            # Convert to RGB if necessary (for JPEG compatibility)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")
            elif image.mode == "RGBA":
                # Create white background for transparent images
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
                image = background
            
            image.save(file_path, "JPEG", quality=95)
            logger.info(f"Image saved successfully: {file_path}")
            
            generated_paths.append(f"generated_images/{filename}")

        except requests.exceptions.HTTPError as e:
            error_data = {}
            try:
                if e.response.text:
                    error_data = e.response.json()
            except Exception:
                error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response body"}
            
            logger.error(f"OpenRouter API error: {error_data}")
            error_message = "Unknown error"
            if isinstance(error_data, dict):
                error_obj = error_data.get("error", {})
                if isinstance(error_obj, dict):
                    error_message = error_obj.get("message", str(e))
                else:
                    error_message = str(e)
            
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Image generation API error: {error_message}"
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error during image generation: {str(e)}")
            raise HTTPException(
                status_code=503,
                detail=f"Network error: Failed to connect to image generation API: {str(e)}"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Unexpected error generating image {i}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected error during image generation: {str(e)}"
            )
            
    if not generated_paths:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate any images. Please check your API key and try again."
        )
    
    return generated_paths

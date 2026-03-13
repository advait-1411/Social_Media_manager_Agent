import os
import uuid
from datetime import datetime
import requests
import base64
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from fastapi import HTTPException
import logging

from typing import Optional
from .ai_assistant import get_image_overlay_plan

logger = logging.getLogger(__name__)

async def generate_images_service(prompt: str, user_prompt: str = "", count: int = 1, model: str = "google/google/gemini-2.5-flash-image", logo_path: Optional[str] = None):
    """
    Generates images using OpenRouter API with Gemini 2.5 Flash Image model,
    and automatically overlays the ONIDA logo and a generated subtle caption.
    """
    generated_paths = []
    output_dir = "generated_images"
    os.makedirs(output_dir, exist_ok=True)
    
    # Pre-fetch the overlay plan using the raw user prompt
    overlay_plan = {"logo_position": "BOTTOM-RIGHT-CORNER", "caption_text": "", "caption_position": "TOP-CENTER"}
    if user_prompt:
        try:
            overlay_plan = await get_image_overlay_plan(user_prompt)
            logger.info(f"Generated overlay plan: {overlay_plan}")
        except Exception as e:
            logger.error(f"Failed to generate overlay plan, using defaults: {e}")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not found. Falling back to mock generation for testing.")
        # Fallback to mock if no key (so app doesn't crash during dev without keys)
        import random
        # from PIL import ImageDraw # This import is now at the top level
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
                # Note: max_tokens is intentionally omitted — image models don't use it
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

            # --- POST PROCESSING: APPLY LOGO AND CAPTION OVERLAY ---
            try:
                img_w, img_h = image.size
                margin = int(img_w * 0.05) # 5% margin
                
                # 1. Overlay Logo
                if logo_path and os.path.exists(logo_path):
                    with Image.open(logo_path) as logo:
                        if logo.mode != 'RGBA':
                            logo = logo.convert('RGBA')
                        
                        # Scale logo to 20% of image width
                        target_logo_w = int(img_w * 0.20)
                        aspect_ratio = logo.height / logo.width
                        target_logo_h = int(target_logo_w * aspect_ratio)
                        
                        # Use LANCZOS for high quality downsampling
                        logo_resized = logo.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)
                        
                        # Calculate position
                        pos_str = overlay_plan.get("logo_position", "BOTTOM-RIGHT-CORNER")
                        if "TOP-LEFT" in pos_str:
                            pos = (margin, margin)
                        elif "TOP-RIGHT" in pos_str:
                            pos = (img_w - target_logo_w - margin, margin)
                        elif "BOTTOM-LEFT" in pos_str:
                            pos = (margin, img_h - target_logo_h - margin)
                        elif "BOTTOM-RIGHT" in pos_str:
                            pos = (img_w - target_logo_w - margin, img_h - target_logo_h - margin)
                        elif "TOP-CENTER" in pos_str:
                            pos = ((img_w - target_logo_w) // 2, margin)
                        elif "BOTTOM-CENTER" in pos_str:
                            pos = ((img_w - target_logo_w) // 2, img_h - target_logo_h - margin)
                        else:
                            pos = (img_w - target_logo_w - margin, img_h - target_logo_h - margin)
                        
                        # Paste using alpha channel
                        image.paste(logo_resized, pos, logo_resized)
                        logger.info(f"Ovelayed ONIDA logo at {pos_str}")
                elif logo_path:
                    logger.warning(f"Logo not found at {logo_path}")

                # 2. Overlay Caption
                caption_text = overlay_plan.get("caption_text")
                if caption_text:
                    draw = ImageDraw.Draw(image, "RGBA")
                    
                    font_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Inter-Bold.ttf')
                    font_size = int(img_h * 0.05) # 5% height (Half of previous 10%)
                    font_size = max(72, min(font_size, 92)) # Clamp to half of previous size
                    
                    try:
                        font = ImageFont.truetype(font_path, font_size)
                    except IOError:
                        logger.warning(f"Font {font_path} not found. Using default font.")
                        font = ImageFont.load_default()
                    
                    # Calculate text size using font metrics
                    letter_spacing = int(font_size * 0.05) # 5% spacing for crisp definition
                    text_w = sum(font.getlength(c) for c in caption_text) + (len(caption_text) - 1) * letter_spacing
                    left, top, right, bottom = font.getbbox(caption_text)
                    text_h = bottom - top
                    
                    # Ensure text fits within image width
                    if text_w > img_w - (margin * 2):
                        # Simple naive scaling if text is too wide
                        scale_factor = (img_w - (margin * 2)) / text_w
                        font_size = int(font_size * scale_factor)
                        font_size = max(40, min(font_size, 92)) # Allow scaling down more to ensure it fits
                        try:
                            font = ImageFont.truetype(font_path, font_size)
                            letter_spacing = int(font_size * 0.05)
                            text_w = sum(font.getlength(c) for c in caption_text) + (len(caption_text) - 1) * letter_spacing
                            left, top, right, bottom = font.getbbox(caption_text)
                            text_h = bottom - top
                        except IOError:
                            pass
                    
                    # Calculate position
                    cap_pos_str = overlay_plan.get("caption_position", "TOP-CENTER")
                    cap_margin = int(img_w * 0.08) # Slightly larger margin for text
                    
                    if "TOP-LEFT" in cap_pos_str:
                        cap_pos = (cap_margin, cap_margin)
                    elif "TOP-RIGHT" in cap_pos_str:
                        cap_pos = (img_w - text_w - cap_margin, cap_margin)
                    elif "BOTTOM-LEFT" in cap_pos_str:
                        cap_pos = (cap_margin, img_h - text_h - cap_margin)
                    elif "BOTTOM-RIGHT" in cap_pos_str:
                        cap_pos = (img_w - text_w - cap_margin, img_h - text_h - cap_margin)
                    elif "TOP-CENTER" in cap_pos_str:
                        cap_pos = ((img_w - text_w) // 2, cap_margin)
                    elif "BOTTOM-CENTER" in cap_pos_str:
                        cap_pos = ((img_w - text_w) // 2, img_h - text_h - cap_margin)
                    else:
                        cap_pos = ((img_w - text_w) // 2, cap_margin) # Default TOP-CENTER
                        
                    # Draw a subtle semi-transparent dark background for readability
                    bg_padding = [int(font_size * 0.5), int(font_size * 0.3)] # left/right, top/bottom
                    bg_rect = [
                        cap_pos[0] - bg_padding[0], 
                        cap_pos[1] - bg_padding[1], 
                        cap_pos[0] + text_w + bg_padding[0], 
                        cap_pos[1] + text_h + bg_padding[1]
                    ]
                    draw.rounded_rectangle(bg_rect, radius=int(font_size*0.3), fill=(0, 0, 0, 140))
                    
                    # Draw subtle drop shadow and main text with letter spacing
                    curr_x = cap_pos[0]
                    curr_y = cap_pos[1]
                    for char in caption_text:
                        draw.text((curr_x+3, curr_y+3), char, font=font, fill=(0, 0, 0, 180)) # Crisp shadow
                        draw.text((curr_x, curr_y), char, font=font, fill=(255, 255, 255, 255)) # Main text without bulky stroke
                        curr_x += dict(Right=font.getlength(char)).get('Right', 0) + letter_spacing
                        
                    logger.info(f"Ovelayed caption '{caption_text}' at {cap_pos_str}")
                
            except Exception as e:
                logger.error(f"Failed to apply post-processing overlay: {e}")
                
            # Save the composite image
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

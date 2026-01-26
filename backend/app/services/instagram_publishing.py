import requests
import os
import time
import logging

# Configure logging for Instagram publishing
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_media_container(instagram_user_id: str, image_url: str, caption: str, access_token: str) -> str:
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{instagram_user_id}/media"
    
    logger.info(f"[INSTAGRAM] Creating media container...")
    logger.info(f"[INSTAGRAM] Image URL: {image_url}")
    logger.info(f"[INSTAGRAM] Caption length: {len(caption) if caption else 0} characters")
    logger.info(f"[INSTAGRAM] API URL: {url}")
    
    data = {
        "image_url": image_url,
        "access_token": access_token
    }
    if caption:
        data["caption"] = caption

    try:
        response = requests.post(url, json=data, timeout=90)
        response.raise_for_status()
        result = response.json()
        container_id = result.get("id")
        
        if not container_id:
            logger.error(f"[INSTAGRAM] ✗ No container ID in response: {result}")
            raise Exception(f"No container ID returned: {result}")
        
        logger.info(f"[INSTAGRAM] ✓ Media container created successfully")
        logger.info(f"[INSTAGRAM] Container ID: {container_id}")
        return container_id
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        error_code = None
        error_type = None
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
                        error_code = error_obj.get('code')
                        error_type = error_obj.get('type')
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM] ✗ HTTP error creating container: {error_data}")
        logger.error(f"[INSTAGRAM] Status code: {e.response.status_code}")
        logger.error(f"[INSTAGRAM] Error message: {error_message}")
        
        # Create a more descriptive exception with the error message
        if error_code == 190 or "expired" in error_message.lower() or "session has expired" in error_message.lower():
            raise Exception(f"Instagram access token has expired. {error_message}. Please update your INSTAGRAM_ACCESS_TOKEN in the .env file or channel settings.")
        else:
            raise Exception(f"Instagram API error: {error_message} (Code: {error_code}, Type: {error_type})")
    except Exception as e:
        logger.error(f"[INSTAGRAM] ✗ Error creating container: {str(e)}")
        raise

def publish_media_container(instagram_user_id: str, container_id: str, access_token: str) -> str:
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{instagram_user_id}/media_publish"
    
    logger.info(f"[INSTAGRAM] Publishing media container...")
    logger.info(f"[INSTAGRAM] Container ID: {container_id}")
    logger.info(f"[INSTAGRAM] API URL: {url}")
    
    data = {"creation_id": container_id, "access_token": access_token}
    
    try:
        response = requests.post(url, json=data, timeout=90)
        response.raise_for_status()
        result = response.json()
        media_id = result.get("id")
        
        if not media_id:
            logger.error(f"[INSTAGRAM] ✗ No media ID in response: {result}")
            raise Exception(f"No media ID returned: {result}")
        
        logger.info(f"[INSTAGRAM] ✓ Media container published successfully")
        logger.info(f"[INSTAGRAM] Media ID: {media_id}")
        return media_id
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        error_code = None
        error_type = None
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
                        error_code = error_obj.get('code')
                        error_type = error_obj.get('type')
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM] ✗ HTTP error publishing container: {error_data}")
        logger.error(f"[INSTAGRAM] Status code: {e.response.status_code}")
        logger.error(f"[INSTAGRAM] Error message: {error_message}")
        
        # Create a more descriptive exception with the error message
        if error_code == 190 or "expired" in error_message.lower() or "session has expired" in error_message.lower():
            raise Exception(f"Instagram access token has expired. {error_message}. Please update your INSTAGRAM_ACCESS_TOKEN in the .env file or channel settings.")
        else:
            raise Exception(f"Instagram API error: {error_message} (Code: {error_code}, Type: {error_type})")
    except Exception as e:
        logger.error(f"[INSTAGRAM] ✗ Error publishing container: {str(e)}")
        raise

def post_to_instagram(image_url: str, caption: str, user_id: str, token: str):
    """
    Orchestrates the Instagram posting flow:
    1. Create Media Container
    2. Wait for processing
    3. Publish Container
    """
    logger.info(f"[INSTAGRAM] ========================================")
    logger.info(f"[INSTAGRAM] Starting Instagram post process")
    logger.info(f"[INSTAGRAM] ========================================")
    
    try:
        # 1. Create Container
        logger.info(f"[INSTAGRAM] Step 1/3: Creating media container...")
        container_id = create_media_container(user_id, image_url, caption, token)
        
        # 2. Wait (Instagram needs time to process the image)
        # Instagram typically needs 30-60 seconds to process the image
        wait_time = 60
        logger.info(f"[INSTAGRAM] Step 2/3: Waiting {wait_time} seconds for Instagram to process the image...")
        logger.info(f"[INSTAGRAM] This is required for Instagram to download and process the image from the URL")
        time.sleep(wait_time)
        logger.info(f"[INSTAGRAM] ✓ Wait completed, proceeding to publish...")
        
        # 3. Publish
        logger.info(f"[INSTAGRAM] Step 3/3: Publishing media container...")
        media_id = publish_media_container(user_id, container_id, token)
        
        logger.info(f"[INSTAGRAM] ========================================")
        logger.info(f"[INSTAGRAM] ✓ Instagram post completed successfully!")
        logger.info(f"[INSTAGRAM] Media ID: {media_id}")
        logger.info(f"[INSTAGRAM] ========================================")
        
        return media_id
        
    except Exception as e:
        logger.error(f"[INSTAGRAM] ========================================")
        logger.error(f"[INSTAGRAM] ✗ Instagram posting failed")
        logger.error(f"[INSTAGRAM] Error: {str(e)}")
        logger.error(f"[INSTAGRAM] ========================================")
        raise e

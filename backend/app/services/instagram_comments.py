"""
Instagram Comments Service
Handles fetching comments, replying, and managing comment interactions via Instagram Graph API
"""

import requests
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

def get_post_comments(media_id: str, access_token: str, limit: int = 50, after: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch comments from an Instagram post via Graph API.
    
    Args:
        media_id: Instagram media ID (from post.platform_settings["instagram_media_id"])
        access_token: Instagram access token
        limit: Maximum number of comments to fetch (default 50)
        after: Cursor for pagination (optional)
    
    Returns:
        Dictionary with 'data' (list of comments) and 'paging' (pagination info)
    
    Raises:
        Exception: If API call fails
    """
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{media_id}/comments"
    
    logger.info(f"[INSTAGRAM COMMENTS] Fetching comments for media ID: {media_id}")
    logger.info(f"[INSTAGRAM COMMENTS] API URL: {url}")
    
    params = {
        "access_token": access_token,
        "fields": "id,text,username,timestamp,parent_id",
        "limit": limit
    }
    
    if after:
        params["after"] = after
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        data = result.get("data", [])
        paging = result.get("paging", {})
        
        logger.info(f"[INSTAGRAM COMMENTS] ✓ Fetched {len(data)} comments")
        
        return {
            "data": data,
            "paging": paging
        }
        
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        error_code = None
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
                        error_code = error_obj.get('code')
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM COMMENTS] ✗ HTTP error fetching comments: {error_data}")
        logger.error(f"[INSTAGRAM COMMENTS] Status code: {e.response.status_code}")
        logger.error(f"[INSTAGRAM COMMENTS] Error message: {error_message}")
        
        if error_code == 190 or "expired" in error_message.lower() or "session has expired" in error_message.lower():
            raise Exception(f"Instagram access token has expired. {error_message}. Please update your INSTAGRAM_ACCESS_TOKEN.")
        else:
            raise Exception(f"Instagram API error: {error_message} (Code: {error_code})")
            
    except Exception as e:
        logger.error(f"[INSTAGRAM COMMENTS] ✗ Error fetching comments: {str(e)}")
        raise


def reply_to_comment(comment_id: str, message: str, access_token: str) -> str:
    """
    Reply to an Instagram comment.
    
    Args:
        comment_id: Instagram comment ID (external_comment_id from our DB)
        message: Reply message text
        access_token: Instagram access token
    
    Returns:
        New reply comment ID from Instagram
    
    Raises:
        Exception: If API call fails
    """
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{comment_id}/replies"
    
    logger.info(f"[INSTAGRAM COMMENTS] Replying to comment ID: {comment_id}")
    logger.info(f"[INSTAGRAM COMMENTS] Reply message: {message[:50]}...")
    logger.info(f"[INSTAGRAM COMMENTS] API URL: {url}")
    
    data = {
        "message": message,
        "access_token": access_token
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        reply_id = result.get("id")
        
        if not reply_id:
            logger.error(f"[INSTAGRAM COMMENTS] ✗ No reply ID in response: {result}")
            raise Exception(f"No reply ID returned: {result}")
        
        logger.info(f"[INSTAGRAM COMMENTS] ✓ Reply posted successfully")
        logger.info(f"[INSTAGRAM COMMENTS] Reply ID: {reply_id}")
        
        return reply_id
        
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        error_code = None
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
                        error_code = error_obj.get('code')
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM COMMENTS] ✗ HTTP error replying to comment: {error_data}")
        logger.error(f"[INSTAGRAM COMMENTS] Status code: {e.response.status_code}")
        logger.error(f"[INSTAGRAM COMMENTS] Error message: {error_message}")
        
        if error_code == 190 or "expired" in error_message.lower() or "session has expired" in error_message.lower():
            raise Exception(f"Instagram access token has expired. {error_message}. Please update your INSTAGRAM_ACCESS_TOKEN.")
        else:
            raise Exception(f"Instagram API error: {error_message} (Code: {error_code})")
            
    except Exception as e:
        logger.error(f"[INSTAGRAM COMMENTS] ✗ Error replying to comment: {str(e)}")
        raise


def hide_comment(comment_id: str, hide: bool, access_token: str) -> None:
    """
    Hide or unhide an Instagram comment.
    
    Args:
        comment_id: Instagram comment ID
        hide: True to hide, False to unhide
        access_token: Instagram access token
    
    Raises:
        Exception: If API call fails
    """
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{comment_id}"
    
    logger.info(f"[INSTAGRAM COMMENTS] {'Hiding' if hide else 'Unhiding'} comment ID: {comment_id}")
    
    data = {
        "is_hidden": hide,
        "access_token": access_token
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        response.raise_for_status()
        
        logger.info(f"[INSTAGRAM COMMENTS] ✓ Comment {'hidden' if hide else 'unhidden'} successfully")
        
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM COMMENTS] ✗ HTTP error hiding comment: {error_data}")
        logger.error(f"[INSTAGRAM COMMENTS] Status code: {e.response.status_code}")
        
        raise Exception(f"Instagram API error: {error_message}")
        
    except Exception as e:
        logger.error(f"[INSTAGRAM COMMENTS] ✗ Error hiding comment: {str(e)}")
        raise


def post_first_comment(media_id: str, text: str, access_token: str) -> str:
    """
    Post a comment on an Instagram media (for "be the first to comment" feature).
    
    Args:
        media_id: Instagram media ID
        text: Comment text
        access_token: Instagram access token
    
    Returns:
        Comment ID from Instagram
    
    Raises:
        Exception: If API call fails
    """
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{media_id}/comments"
    
    logger.info(f"[INSTAGRAM COMMENTS] Posting first comment on media ID: {media_id}")
    logger.info(f"[INSTAGRAM COMMENTS] Comment text: {text[:50]}...")
    logger.info(f"[INSTAGRAM COMMENTS] API URL: {url}")
    
    data = {
        "message": text,
        "access_token": access_token
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        
        comment_id = result.get("id")
        
        if not comment_id:
            logger.error(f"[INSTAGRAM COMMENTS] ✗ No comment ID in response: {result}")
            raise Exception(f"No comment ID returned: {result}")
        
        logger.info(f"[INSTAGRAM COMMENTS] ✓ First comment posted successfully")
        logger.info(f"[INSTAGRAM COMMENTS] Comment ID: {comment_id}")
        
        return comment_id
        
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        error_code = None
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
                        error_code = error_obj.get('code')
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        logger.error(f"[INSTAGRAM COMMENTS] ✗ HTTP error posting comment: {error_data}")
        logger.error(f"[INSTAGRAM COMMENTS] Status code: {e.response.status_code}")
        logger.error(f"[INSTAGRAM COMMENTS] Error message: {error_message}")
        
        if error_code == 190 or "expired" in error_message.lower() or "session has expired" in error_message.lower():
            raise Exception(f"Instagram access token has expired. {error_message}. Please update your INSTAGRAM_ACCESS_TOKEN.")
        else:
            raise Exception(f"Instagram API error: {error_message} (Code: {error_code})")
            
    except Exception as e:
        logger.error(f"[INSTAGRAM COMMENTS] ✗ Error posting comment: {str(e)}")
        raise


def pin_comment(comment_id: str, access_token: str) -> bool:
    """
    Pin a comment on Instagram.
    
    NOTE: Instagram Graph API may not support pinning comments programmatically.
    This function is a placeholder and will attempt the operation but may not be supported.
    
    Args:
        comment_id: Instagram comment ID
        access_token: Instagram access token
    
    Returns:
        True if successful, False if not supported
    
    Raises:
        Exception: If API call fails with error other than "not supported"
    """
    logger.warning(f"[INSTAGRAM COMMENTS] Pin comment feature may not be supported by Instagram Graph API")
    logger.info(f"[INSTAGRAM COMMENTS] Attempting to pin comment ID: {comment_id}")
    
    # Instagram Graph API doesn't currently support pinning comments programmatically
    # This would need to be done manually through the Instagram app
    # We'll log this and return False to indicate it's not supported
    
    logger.info(f"[INSTAGRAM COMMENTS] ⚠ Pin comment not supported via API - must be done manually in Instagram app")
    return False


def set_comments_enabled(media_id: str, enabled: bool, access_token: str) -> bool:
    """
    Enable or disable comments on an Instagram post.
    
    NOTE: This setting is typically only available during media container creation,
    not after publishing. This function attempts to update but may not be supported.
    
    Args:
        media_id: Instagram media ID
        enabled: True to enable comments, False to disable
        access_token: Instagram access token
    
    Returns:
        True if successful, False if not supported
    
    Raises:
        Exception: If API call fails
    """
    api_version = os.getenv("INSTAGRAM_API_VERSION", "v21.0")
    url = f"https://graph.facebook.com/{api_version}/{media_id}"
    
    logger.info(f"[INSTAGRAM COMMENTS] {'Enabling' if enabled else 'Disabling'} comments on media ID: {media_id}")
    
    data = {
        "comment_enabled": enabled,
        "access_token": access_token
    }
    
    try:
        response = requests.post(url, json=data, timeout=30)
        response.raise_for_status()
        
        logger.info(f"[INSTAGRAM COMMENTS] ✓ Comments {'enabled' if enabled else 'disabled'} successfully")
        return True
        
    except requests.exceptions.HTTPError as e:
        error_data = {}
        error_message = "Unknown error"
        
        try:
            if e.response.text:
                error_data = e.response.json()
                if isinstance(error_data, dict) and 'error' in error_data:
                    error_obj = error_data['error']
                    if isinstance(error_obj, dict):
                        error_message = error_obj.get('message', str(e))
        except:
            error_data = {"raw_response": e.response.text[:500] if e.response.text else "No response"}
        
        # Check if this is a "not supported" error
        if "not supported" in error_message.lower() or "invalid parameter" in error_message.lower():
            logger.warning(f"[INSTAGRAM COMMENTS] ⚠ Setting comments enabled/disabled not supported after publishing")
            return False
        
        logger.error(f"[INSTAGRAM COMMENTS] ✗ HTTP error setting comments: {error_data}")
        logger.error(f"[INSTAGRAM COMMENTS] Status code: {e.response.status_code}")
        
        raise Exception(f"Instagram API error: {error_message}")
        
    except Exception as e:
        logger.error(f"[INSTAGRAM COMMENTS] ✗ Error setting comments: {str(e)}")
        raise


def set_like_count_hidden(media_id: str, hidden: bool, access_token: str) -> bool:
    """
    Hide or show like count on an Instagram post.
    
    NOTE: This feature may not be available via Instagram Graph API.
    Like count visibility is typically controlled in Instagram app settings.
    
    Args:
        media_id: Instagram media ID
        hidden: True to hide like count, False to show
        access_token: Instagram access token
    
    Returns:
        True if successful, False if not supported
    
    Raises:
        Exception: If API call fails
    """
    logger.warning(f"[INSTAGRAM COMMENTS] Hide like count feature may not be supported by Instagram Graph API")
    logger.info(f"[INSTAGRAM COMMENTS] Attempting to {'hide' if hidden else 'show'} like count on media ID: {media_id}")
    
    # Instagram Graph API doesn't currently support hiding like counts programmatically
    # This is controlled through Instagram app settings
    # We'll log this and return False to indicate it's not supported
    
    logger.info(f"[INSTAGRAM COMMENTS] ⚠ Hide like count not supported via API - must be configured in Instagram app settings")
    return False

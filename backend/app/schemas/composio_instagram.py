from pydantic import BaseModel


class ComposioPostRequest(BaseModel):
    """
    Two required inputs for POST /agent/instagram/composio-post.
    These map 1:1 to the arguments of the INSTAGRAM_CREATE_MEDIA_CONTAINER Composio tool.
    - image_url: publicly accessible image URL
    - caption:   Instagram caption (include hashtags here)

    COMPOSIO_API_KEY and INSTAGRAM_USER_ID are always read from .env; no override accepted.
    """
    image_url: str
    caption: str

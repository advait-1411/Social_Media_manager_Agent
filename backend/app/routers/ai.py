from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..services.ai_assistant import generate_caption, repurpose_caption, suggest_hashtags

router = APIRouter()

class GenerateCaptionRequest(BaseModel):
    prompt: str
    platform: str = "instagram"
    tone: str = "professional"

class RepurposeRequest(BaseModel):
    caption: str
    target_platform: str

class HashtagRequest(BaseModel):
    content: str
    platform: str = "instagram"
    count: int = 10

@router.post("/generate-caption")
async def api_generate_caption(request: GenerateCaptionRequest):
    try:
        caption = await generate_caption(request.prompt, request.platform, request.tone)
        return {"success": True, "caption": caption}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/repurpose")
async def api_repurpose_caption(request: RepurposeRequest):
    try:
        repurposed = await repurpose_caption(request.caption, request.target_platform)
        return {"success": True, "caption": repurposed, "platform": request.target_platform}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/hashtags")
async def api_suggest_hashtags(request: HashtagRequest):
    try:
        hashtags = await suggest_hashtags(request.content, request.platform, request.count)
        return {"success": True, "hashtags": hashtags}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

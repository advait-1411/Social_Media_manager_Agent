from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from ..services.image_gen import generate_images_service
from pydantic import BaseModel
from typing import List, Optional
import shutil
import os
import uuid

router = APIRouter()

class GenerateRequest(BaseModel):
    prompt: str
    count: int = 4
    model: str = "google/gemini-2.5-flash-image"

@router.post("/generate")
async def generate_assets(request: GenerateRequest, db: Session = Depends(get_db)):
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt cannot be empty")
        
        paths = await generate_images_service(request.prompt.strip(), request.count, request.model)
        
        if not paths:
            raise HTTPException(
                status_code=500, 
                detail="Image generation completed but no images were created. Please try again."
            )
        
        assets = []
        for p in paths:
            asset = models.Asset(
                file_path=p,
                asset_type="image",
                prompt=request.prompt.strip(),
                meta_data={"model": request.model, "source": "generated"}
            )
            db.add(asset)
            assets.append(asset)
        
        db.commit()
        for a in assets:
            db.refresh(a)
        return assets
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.exception(f"Error in generate_assets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate assets: {str(e)}")

@router.get("/")
def get_assets(db: Session = Depends(get_db)):
    return db.query(models.Asset).order_by(models.Asset.created_at.desc()).all()

@router.post("/upload")
async def upload_asset(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        output_dir = "generated_images"
        os.makedirs(output_dir, exist_ok=True)
        
        ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        filename = f"upload_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(output_dir, filename)
        
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        asset = models.Asset(
            file_path=path,
            asset_type="image" if ext.lower() in ['jpg','png','jpeg','webp'] else "video",
            meta_data={"original_name": file.filename, "source": "upload"}
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        return asset
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

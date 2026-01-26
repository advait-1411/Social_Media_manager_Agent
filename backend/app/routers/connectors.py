from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from pydantic import BaseModel
import os

router = APIRouter()

class ConnectRequest(BaseModel):
    platform: str
    name: str 
    user_id: str
    access_token: str

@router.get("/")
def get_channels(db: Session = Depends(get_db)):
    channels = db.query(models.Channel).all()
    # If no channels and .env has credentials, insert default Instagram
    if not channels:
        uid = os.getenv("INSTAGRAM_USER_ID")
        token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
        if uid and token:
            default_ch = models.Channel(
                platform="instagram",
                name="Default Account", 
                credentials={"user_id": uid, "access_token": token}
            )
            db.add(default_ch)
            db.commit()
            db.refresh(default_ch)
            return [default_ch]
    return channels

@router.post("/connect")
def connect_channel(req: ConnectRequest, db: Session = Depends(get_db)):
    existing = db.query(models.Channel).filter(models.Channel.platform == req.platform, models.Channel.name == req.name).first()
    if existing:
        existing.credentials = {"user_id": req.user_id, "access_token": req.access_token}
        db.commit()
        db.refresh(existing)
        return existing
        
    ch = models.Channel(
        platform=req.platform,
        name=req.name,
        credentials={"user_id": req.user_id, "access_token": req.access_token}
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return ch

"""
brand_kits.py — Brand Kit CRUD router

Endpoints:
  GET    /api/brand-kits              – list all kits (with asset_count)
  POST   /api/brand-kits              – create new kit
  GET    /api/brand-kits/{kit_id}     – single kit detail
  PUT    /api/brand-kits/{kit_id}     – patch name/description/system_prompt
  DELETE /api/brand-kits/{kit_id}     – delete if no assets
  POST   /api/brand-kits/{kit_id}/logo – upload logo_light / logo_dark
"""

import os
import uuid
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import BrandKit, Asset

logger = logging.getLogger(__name__)

router = APIRouter()

LOGO_DIR = "brand_kit_logos"


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class BrandKitCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str


class BrandKitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _kit_to_dict(kit: BrandKit, db: Session) -> dict:
    asset_count = db.query(Asset).filter(Asset.brand_kit_id == kit.id).count()
    return {
        "id": kit.id,
        "name": kit.name,
        "description": kit.description,
        "system_prompt": kit.system_prompt,
        "logo_light_path": kit.logo_light_path,
        "logo_dark_path": kit.logo_dark_path,
        "is_default": kit.is_default,
        "created_at": kit.created_at.isoformat() if kit.created_at else None,
        "updated_at": kit.updated_at.isoformat() if kit.updated_at else None,
        "asset_count": asset_count,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_brand_kits(db: Session = Depends(get_db)):
    """List all brand kits with asset counts."""
    kits = db.query(BrandKit).order_by(BrandKit.is_default.desc(), BrandKit.created_at.asc()).all()
    return [_kit_to_dict(k, db) for k in kits]


@router.post("/")
def create_brand_kit(body: BrandKitCreate, db: Session = Depends(get_db)):
    """Create a new brand kit. Name must be unique."""
    existing = db.query(BrandKit).filter(BrandKit.name == body.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A brand kit with name '{body.name}' already exists.")

    kit = BrandKit(
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        is_default=False,
    )
    db.add(kit)
    db.commit()
    db.refresh(kit)
    logger.info(f"[BRAND_KITS] Created kit id={kit.id} name='{kit.name}'")
    return _kit_to_dict(kit, db)


@router.get("/{kit_id}")
def get_brand_kit(kit_id: int, db: Session = Depends(get_db)):
    """Get a single brand kit by ID."""
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Brand kit {kit_id} not found.")
    return _kit_to_dict(kit, db)


@router.put("/{kit_id}")
def update_brand_kit(kit_id: int, body: BrandKitUpdate, db: Session = Depends(get_db)):
    """Patch name, description, or system_prompt. Cannot change is_default via this endpoint."""
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Brand kit {kit_id} not found.")

    if body.name is not None and body.name != kit.name:
        conflict = db.query(BrandKit).filter(BrandKit.name == body.name).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"A brand kit with name '{body.name}' already exists.")
        kit.name = body.name

    if body.description is not None:
        kit.description = body.description

    if body.system_prompt is not None:
        kit.system_prompt = body.system_prompt

    db.commit()
    db.refresh(kit)
    logger.info(f"[BRAND_KITS] Updated kit id={kit.id}")
    return _kit_to_dict(kit, db)


@router.delete("/{kit_id}")
def delete_brand_kit(kit_id: int, db: Session = Depends(get_db)):
    """
    Delete a brand kit.
    Returns 400 if kit has associated assets (reassign first).
    """
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Brand kit {kit_id} not found.")

    asset_count = db.query(Asset).filter(Asset.brand_kit_id == kit_id).count()
    if asset_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete a kit that has assets. Reassign assets first."
        )

    db.delete(kit)
    db.commit()
    logger.info(f"[BRAND_KITS] Deleted kit id={kit_id}")
    return {"message": f"Brand kit {kit_id} deleted successfully."}


@router.post("/{kit_id}/logo")
async def upload_kit_logo(
    kit_id: int,
    logo_light: Optional[UploadFile] = File(None),
    logo_dark: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    Upload logo_light and/or logo_dark files for a brand kit.
    Files are saved to brand_kit_logos/ directory.
    """
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Brand kit {kit_id} not found.")

    os.makedirs(LOGO_DIR, exist_ok=True)

    if logo_light and logo_light.filename:
        ext = logo_light.filename.rsplit(".", 1)[-1] if "." in logo_light.filename else "png"
        filename = f"kit_{kit_id}_light_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(LOGO_DIR, filename)
        content = await logo_light.read()
        with open(path, "wb") as f:
            f.write(content)
        kit.logo_light_path = path
        logger.info(f"[BRAND_KITS] Saved light logo for kit {kit_id} → {path}")

    if logo_dark and logo_dark.filename:
        ext = logo_dark.filename.rsplit(".", 1)[-1] if "." in logo_dark.filename else "png"
        filename = f"kit_{kit_id}_dark_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(LOGO_DIR, filename)
        content = await logo_dark.read()
        with open(path, "wb") as f:
            f.write(content)
        kit.logo_dark_path = path
        logger.info(f"[BRAND_KITS] Saved dark logo for kit {kit_id} → {path}")

    if not logo_light and not logo_dark:
        raise HTTPException(status_code=400, detail="Provide at least one of logo_light or logo_dark.")

    db.commit()
    db.refresh(kit)
    return _kit_to_dict(kit, db)

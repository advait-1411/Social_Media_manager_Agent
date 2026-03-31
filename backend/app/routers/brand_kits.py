"""
brand_kits.py — Product Kit CRUD router

Terminology note:
  - DB / code   : "brand_kits", "system_prompt"
  - UI / B2B    : "Product Kit",  "Product Guidelines"
  The API contract keeps backward-compatible snake_case names.

Endpoints:
  GET    /api/brand-kits              – list all kits (with asset_count)
  POST   /api/brand-kits              – create new kit
  GET    /api/brand-kits/{kit_id}     – single kit detail
  PUT    /api/brand-kits/{kit_id}     – patch name/description/system_prompt/product_guidelines
  DELETE /api/brand-kits/{kit_id}     – delete if no assets
  POST   /api/brand-kits/{kit_id}/logo         – upload logo_light / logo_dark (legacy)
  POST   /api/brand-kits/{kit_id}/assets/upload – upload typed KitAsset (product_asset or logo_trademark)
  GET    /api/brand-kits/{kit_id}/assets        – list typed KitAssets for a kit
  DELETE /api/brand-kits/{kit_id}/assets/{asset_id} – delete a KitAsset
"""

import os
import re
import uuid
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.models import BrandKit, Asset, KitAsset

logger = logging.getLogger(__name__)

router = APIRouter()

LOGO_DIR = "brand_kit_logos"
KIT_ASSETS_DIR = "kit_assets"

# Valid asset types for typed kit assets
VALID_ASSET_TYPES = {"product_asset", "logo_trademark"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_token(name: str) -> str:
    """
    Generate a mention-safe token from a user-entered asset name.
    'Nike Hypervenom Neon Pink 1' → 'nike-hypervenom-neon-pink-1'
    """
    text = name.strip().lower()
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"[^a-z0-9\-]", "", text)
    return text


def _kit_asset_to_dict(ka: KitAsset) -> dict:
    return {
        "id": ka.id,
        "product_kit_id": ka.product_kit_id,
        "name": ka.name,
        "token": ka.token,
        "asset_type": ka.asset_type,
        "file_path": ka.file_path,
        "mime_type": ka.mime_type,
        "usable_in_generation": ka.usable_in_generation,
        "usable_for_overlay": ka.usable_for_overlay,
        "created_at": ka.created_at.isoformat() if ka.created_at else None,
    }


def _kit_to_dict(kit: BrandKit, db: Session) -> dict:
    asset_count = db.query(Asset).filter(Asset.brand_kit_id == kit.id).count()
    kit_assets = db.query(KitAsset).filter(KitAsset.product_kit_id == kit.id).all()
    return {
        "id": kit.id,
        "name": kit.name,
        "description": kit.description,
        # Both field names returned for forward/backward compat
        "system_prompt": kit.system_prompt,
        "product_guidelines": kit.system_prompt,
        "logo_light_path": kit.logo_light_path,
        "logo_dark_path": kit.logo_dark_path,
        "is_default": kit.is_default,
        "created_at": kit.created_at.isoformat() if kit.created_at else None,
        "updated_at": kit.updated_at.isoformat() if kit.updated_at else None,
        "asset_count": asset_count,
        "kit_assets": [_kit_asset_to_dict(ka) for ka in kit_assets],
    }


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ProductKitCreate(BaseModel):
    name: str
    description: Optional[str] = None
    # Accept both field names for compat; system_prompt takes precedence if both given
    system_prompt: Optional[str] = None
    product_guidelines: Optional[str] = None

    def resolved_guidelines(self) -> str:
        val = self.system_prompt or self.product_guidelines
        if not val:
            raise ValueError("Either system_prompt or product_guidelines must be provided.")
        return val


class ProductKitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    product_guidelines: Optional[str] = None


# Keep old alias for backward compat
BrandKitCreate = ProductKitCreate
BrandKitUpdate = ProductKitUpdate


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_brand_kits(db: Session = Depends(get_db)):
    """List all Product Kits with asset counts and typed kit assets."""
    kits = db.query(BrandKit).order_by(BrandKit.is_default.desc(), BrandKit.created_at.asc()).all()
    return [_kit_to_dict(k, db) for k in kits]


@router.post("/")
def create_brand_kit(body: ProductKitCreate, db: Session = Depends(get_db)):
    """Create a new Product Kit. Name must be unique."""
    try:
        guidelines = body.resolved_guidelines()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    existing = db.query(BrandKit).filter(BrandKit.name == body.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"A Product Kit with name '{body.name}' already exists.")

    kit = BrandKit(
        name=body.name,
        description=body.description,
        system_prompt=guidelines,
        is_default=False,
    )
    db.add(kit)
    db.commit()
    db.refresh(kit)
    logger.info(f"[PRODUCT_KITS] Created kit id={kit.id} name='{kit.name}'")
    return _kit_to_dict(kit, db)


@router.get("/{kit_id}")
def get_brand_kit(kit_id: int, db: Session = Depends(get_db)):
    """Get a single Product Kit by ID."""
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")
    return _kit_to_dict(kit, db)


@router.put("/{kit_id}")
def update_brand_kit(kit_id: int, body: ProductKitUpdate, db: Session = Depends(get_db)):
    """Patch name, description, or product_guidelines / system_prompt."""
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")

    if body.name is not None and body.name != kit.name:
        conflict = db.query(BrandKit).filter(BrandKit.name == body.name).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"A Product Kit with name '{body.name}' already exists.")
        kit.name = body.name

    if body.description is not None:
        kit.description = body.description

    # Accept both field names; system_prompt takes priority
    new_guidelines = body.system_prompt or body.product_guidelines
    if new_guidelines is not None:
        kit.system_prompt = new_guidelines

    db.commit()
    db.refresh(kit)
    logger.info(f"[PRODUCT_KITS] Updated kit id={kit.id}")
    return _kit_to_dict(kit, db)


@router.delete("/{kit_id}")
def delete_brand_kit(kit_id: int, db: Session = Depends(get_db)):
    """
    Cascade-delete a Product Kit and ALL related data.

    Deletion order:
      1. Block if this is the default kit (safety guard).
      2. Delete KitAsset files from disk (product images, logos).
         -- ORM cascade="all, delete-orphan" will remove the DB rows.
      3. Nullify brand_kit_id on Asset rows that reference this kit.
         (Generated images are kept but unlinked — they still exist in the closet.)
      4. Delete legacy logo files (logo_light_path / logo_dark_path) from disk.
      5. Delete the BrandKit row — ORM cascade removes KitAsset rows automatically.
    """
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")

    if kit.is_default:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the default Product Kit."
        )

    # ── Step 2: Delete KitAsset files from disk ───────────────────────────────
    kit_assets = db.query(KitAsset).filter(KitAsset.product_kit_id == kit_id).all()
    files_deleted = 0
    files_failed = 0
    for ka in kit_assets:
        try:
            if ka.file_path and os.path.exists(ka.file_path):
                os.remove(ka.file_path)
                files_deleted += 1
        except Exception as e:
            logger.warning(f"[PRODUCT_KITS] Could not delete kit_asset file {ka.file_path}: {e}")
            files_failed += 1

    logger.info(
        f"[PRODUCT_KITS] Deleting kit id={kit_id}: "
        f"{len(kit_assets)} kit_assets, {files_deleted} files removed, {files_failed} failed."
    )

    # ── Step 3: Nullify brand_kit_id on generated Asset rows ─────────────────
    # We keep the generated images (they're in the asset closet) but unlink them
    # from the now-deleted kit so there are no dangling FK references.
    linked_assets = db.query(Asset).filter(Asset.brand_kit_id == kit_id).all()
    for asset in linked_assets:
        asset.brand_kit_id = None
    if linked_assets:
        db.flush()
        logger.info(
            f"[PRODUCT_KITS] Unlinked {len(linked_assets)} generated asset(s) "
            f"from kit id={kit_id}."
        )

    # ── Step 4: Delete legacy logo files from disk ────────────────────────────
    for logo_path in (kit.logo_light_path, kit.logo_dark_path):
        if logo_path:
            try:
                if os.path.exists(logo_path):
                    os.remove(logo_path)
            except Exception as e:
                logger.warning(f"[PRODUCT_KITS] Could not delete logo file {logo_path}: {e}")

    # ── Step 5: Delete the kit row (ORM cascade removes KitAsset rows) ────────
    db.delete(kit)
    db.commit()
    logger.info(f"[PRODUCT_KITS] Deleted kit id={kit_id} name='{kit.name}'")
    return {
        "message": f"Product Kit '{kit.name}' deleted successfully.",
        "kit_assets_deleted": len(kit_assets),
        "assets_unlinked": len(linked_assets),
    }



# ── Legacy logo upload (kept for backward compat) ─────────────────────────────

@router.post("/{kit_id}/logo")
async def upload_kit_logo(
    kit_id: int,
    logo_light: Optional[UploadFile] = File(None),
    logo_dark: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    Upload logo_light and/or logo_dark files for a Product Kit (legacy endpoint).
    New code should use POST /{kit_id}/assets/upload with asset_type='logo_trademark'.
    """
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")

    os.makedirs(LOGO_DIR, exist_ok=True)

    if logo_light and logo_light.filename:
        ext = logo_light.filename.rsplit(".", 1)[-1] if "." in logo_light.filename else "png"
        filename = f"kit_{kit_id}_light_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(LOGO_DIR, filename)
        content = await logo_light.read()
        with open(path, "wb") as f:
            f.write(content)
        kit.logo_light_path = path
        logger.info(f"[PRODUCT_KITS] Saved light logo for kit {kit_id} → {path}")

    if logo_dark and logo_dark.filename:
        ext = logo_dark.filename.rsplit(".", 1)[-1] if "." in logo_dark.filename else "png"
        filename = f"kit_{kit_id}_dark_{uuid.uuid4().hex}.{ext}"
        path = os.path.join(LOGO_DIR, filename)
        content = await logo_dark.read()
        with open(path, "wb") as f:
            f.write(content)
        kit.logo_dark_path = path
        logger.info(f"[PRODUCT_KITS] Saved dark logo for kit {kit_id} → {path}")

    if not logo_light and not logo_dark:
        raise HTTPException(status_code=400, detail="Provide at least one of logo_light or logo_dark.")

    db.commit()
    db.refresh(kit)
    return _kit_to_dict(kit, db)


# ── Typed KitAsset endpoints ──────────────────────────────────────────────────

@router.post("/{kit_id}/assets/upload")
async def upload_kit_asset(
    kit_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    asset_type: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload a typed asset to a Product Kit.

    asset_type must be:
      - 'product_asset'   → used for image generation
      - 'logo_trademark'  → used for overlay only (NEVER sent to image generation)

    The `name` parameter is the user-entered canonical label.
    It becomes an @tag token for AI Mode: @<normalized-name>.

    LOGO_SAFETY_RULE: This endpoint records the asset_type in DB.
    The generation pipeline MUST filter by usable_in_generation=True.
    The overlay pipeline MUST filter by usable_for_overlay=True.
    """
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")

    if asset_type not in VALID_ASSET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid asset_type '{asset_type}'. Must be one of: {sorted(VALID_ASSET_TYPES)}"
        )

    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Asset name is required.")

    # File save
    os.makedirs(KIT_ASSETS_DIR, exist_ok=True)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"kit_{kit_id}_{asset_type}_{uuid.uuid4().hex}.{ext}"
    path = os.path.join(KIT_ASSETS_DIR, filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    # Determine business rule flags
    if asset_type == "product_asset":
        in_gen = True
        for_overlay = False
    else:  # logo_trademark
        # LOGO_SAFETY_RULE: logo trademarks MUST NOT enter image generation
        in_gen = False
        for_overlay = True

    token = _normalize_token(name.strip())

    kit_asset = KitAsset(
        product_kit_id=kit_id,
        name=name.strip(),
        token=token,
        asset_type=asset_type,
        file_path=path,
        mime_type=file.content_type,
        usable_in_generation=in_gen,
        usable_for_overlay=for_overlay,
    )
    db.add(kit_asset)
    db.commit()
    db.refresh(kit_asset)

    logger.info(
        f"[PRODUCT_KITS] Uploaded kit_asset id={kit_asset.id} "
        f"type='{asset_type}' name='{name}' token='{token}' kit={kit_id}"
    )
    return _kit_asset_to_dict(kit_asset)


@router.get("/{kit_id}/assets")
def list_kit_assets(
    kit_id: int,
    asset_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List typed KitAssets for a Product Kit, optionally filtered by asset_type."""
    kit = db.query(BrandKit).filter(BrandKit.id == kit_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail=f"Product Kit {kit_id} not found.")

    q = db.query(KitAsset).filter(KitAsset.product_kit_id == kit_id)
    if asset_type:
        q = q.filter(KitAsset.asset_type == asset_type)
    return [_kit_asset_to_dict(ka) for ka in q.all()]


@router.delete("/{kit_id}/assets/{asset_id}")
def delete_kit_asset(kit_id: int, asset_id: int, db: Session = Depends(get_db)):
    """Delete a typed KitAsset and remove the file from disk."""
    ka = db.query(KitAsset).filter(
        KitAsset.id == asset_id,
        KitAsset.product_kit_id == kit_id,
    ).first()
    if not ka:
        raise HTTPException(status_code=404, detail="Kit asset not found.")

    try:
        if os.path.exists(ka.file_path):
            os.remove(ka.file_path)
    except Exception as e:
        logger.warning(f"[PRODUCT_KITS] Could not delete file {ka.file_path}: {e}")

    db.delete(ka)
    db.commit()
    return {"message": f"Kit asset {asset_id} deleted."}

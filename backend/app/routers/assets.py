from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import models
from ..services.image_gen import generate_images_service
from ..services.prompt_builder import build_remix_prompt
from pydantic import BaseModel
from typing import List, Optional
import shutil
import os
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class GenerateRequest(BaseModel):
    prompt: str
    count: int = 4
    model: str = "google/gemini-2.5-flash-image"
    brand_kit_id: Optional[int] = None


class AssetRemixRequest(BaseModel):
    prompt: str
    num_variants: int = 1
    brand_kit_id: Optional[int] = None


def _resolve_kit(brand_kit_id: Optional[int], db: Session) -> models.BrandKit | None:
    """
    Resolve a BrandKit from the given id.
    If None, returns the is_default=True kit.
    If no default exists, returns None.
    Raises 404 if a specific id was given but not found.
    """
    if brand_kit_id is not None:
        kit = db.query(models.BrandKit).filter(models.BrandKit.id == brand_kit_id).first()
        if not kit:
            raise HTTPException(status_code=404, detail=f"Brand kit {brand_kit_id} not found.")
        return kit
    return db.query(models.BrandKit).filter(models.BrandKit.is_default == True).first()


@router.post("/generate")
async def generate_assets(request: GenerateRequest, db: Session = Depends(get_db)):
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt cannot be empty")

        # -- Resolve brand kit & system prompt --
        kit = _resolve_kit(request.brand_kit_id, db)
        system_prompt_to_use = kit.system_prompt if kit else None
        resolved_kit_id = kit.id if kit else None

        # Assemble prompt with brand rules
        user_prompt = request.prompt.strip()
        final_prompt = build_remix_prompt(user_prompt, system_prompt_to_use)
        logger.info(
            f"[ASSETS-GENERATE] Assembled prompt ({len(final_prompt)} chars) for "
            f"user_prompt='{user_prompt[:60]}…' kit_id={resolved_kit_id}"
        )

        paths = await generate_images_service(
            prompt=final_prompt,
            user_prompt=user_prompt,
            count=request.count,
            model=request.model,
            logo_path=kit.logo_light_path if kit else None
        )

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
                prompt=user_prompt,
                system_prompt=system_prompt_to_use,
                brand_kit_id=resolved_kit_id,
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
        logger.exception(f"Error in generate_assets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate assets: {str(e)}")

@router.get("/")
def get_assets(
    brand_kit_id: Optional[int] = Query(None, description="Filter assets by brand kit ID"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Asset).order_by(models.Asset.created_at.desc())
    if brand_kit_id is not None:
        q = q.filter(models.Asset.brand_kit_id == brand_kit_id)
    return q.all()

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

        # Link to the default kit if available
        default_kit = db.query(models.BrandKit).filter(models.BrandKit.is_default == True).first()
        kit_id = default_kit.id if default_kit else None

        asset = models.Asset(
            file_path=path,
            asset_type="image" if ext.lower() in ['jpg','png','jpeg','webp'] else "video",
            system_prompt=default_kit.system_prompt if default_kit else None,
            brand_kit_id=kit_id,
            meta_data={"original_name": file.filename, "source": "upload"}
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        return asset
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Attempt to delete file from disk
    try:
        if os.path.exists(asset.file_path):
            os.remove(asset.file_path)
    except Exception as e:
        print(f"Error deleting file {asset.file_path}: {e}")
        # We continue to delete the DB record even if file deletion fails/file missing

    db.delete(asset)
    db.commit()
    return {"message": "Asset deleted successfully"}


@router.post("/{asset_id}/remix")
async def remix_asset(
    asset_id: int,
    request: AssetRemixRequest,
    db: Session = Depends(get_db)
):
    """
    Composite "Remix with AI" endpoint.

    Strategy (Option B – Composite):
      1. Generate a background image from the user prompt via the existing image-gen service.
      2. Open the original product image and paste it centred on the generated background with Pillow.
      3. Save each composite as a new Asset with parent_id = original asset ID.
    """
    logger.info(f'[ASSETS-REMIX] Starting composite remix for asset {asset_id} with prompt="{request.prompt}"')

    # --- 0. Validate input -------------------------------------------------------
    num_variants = max(1, min(request.num_variants, 3))  # cap at 3

    # --- 1. Fetch the source asset -----------------------------------------------
    asset = db.query(models.Asset).filter(models.Asset.id == asset_id).first()
    if not asset:
        logger.error(f"[ASSETS-REMIX] ✗ Asset {asset_id} not found")
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

    source_path = asset.file_path
    if not os.path.exists(source_path):
        logger.error(f"[ASSETS-REMIX] ✗ Source file missing: {source_path}")
        raise HTTPException(status_code=400, detail=f"Source image file not found on disk: {source_path}")

    # -- Resolve brand kit & system prompt --
    # If request provides a kit id, use it; otherwise inherit from parent asset
    requested_kit_id = request.brand_kit_id if request.brand_kit_id is not None else asset.brand_kit_id
    kit = _resolve_kit(requested_kit_id, db) if requested_kit_id is not None else None
    resolved_kit_id = kit.id if kit else (asset.brand_kit_id or None)

    try:
        from PIL import Image
        from io import BytesIO

        output_dir = "generated_images"
        os.makedirs(output_dir, exist_ok=True)

        new_assets: List[models.Asset] = []

        # Resolve system prompt: inherit from parent, fall back to global
        parent_system_prompt = (asset.system_prompt or "").strip() or None
        final_prompt = build_remix_prompt(request.prompt, parent_system_prompt)
        resolved_system_prompt = (asset.system_prompt or "").strip() or None
        logger.info(
            f"[ASSETS-REMIX] Assembled remix prompt ({len(final_prompt)} chars) "
            f"for user_prompt='{request.prompt[:60]}…' kit_id={resolved_kit_id}"
        )

        for i in range(num_variants):
            # --- 2A. Generate background via AI image-gen service ----------------
            logger.info(f"[ASSETS-REMIX] Generating background {i + 1}/{num_variants}…")
            bg_paths = await generate_images_service(
                prompt=final_prompt,
                count=1,
                logo_path=kit.logo_light_path if kit else None
            )
            if not bg_paths:
                raise Exception("Background image generation returned no paths")
            bg_path = bg_paths[0]

            # --- 2B. Composite: paste product onto background --------------------
            with Image.open(bg_path).convert("RGBA") as bg_img:
                bg_w, bg_h = bg_img.size

                with Image.open(source_path).convert("RGBA") as fg_img:
                    # Scale foreground to 60 % of the background's shorter dimension
                    scale = 0.60
                    max_dim = int(min(bg_w, bg_h) * scale)
                    fg_img.thumbnail((max_dim, max_dim), Image.LANCZOS)
                    fg_w, fg_h = fg_img.size

                    # Centre position
                    paste_x = (bg_w - fg_w) // 2
                    paste_y = (bg_h - fg_h) // 2

                    # Paste using alpha channel as mask for clean edges
                    bg_img.paste(fg_img, (paste_x, paste_y), mask=fg_img.split()[3])

                # Convert to RGB for JPEG
                composite = bg_img.convert("RGB")

            # --- 2C. Save composite ----------------------------------------------
            remix_filename = f"remix_{uuid.uuid4().hex}_{i}.jpg"
            composite_path = os.path.join(output_dir, remix_filename)
            composite.save(composite_path, "JPEG", quality=95)
            logger.info(f"[ASSETS-REMIX] Composite saved to {composite_path}")

            # --- 3. Create Asset DB row -----------------------------------------
            new_asset = models.Asset(
                file_path=f"{output_dir}/{remix_filename}",
                asset_type="image",
                prompt=request.prompt,
                system_prompt=resolved_system_prompt,
                parent_id=asset_id,
                brand_kit_id=resolved_kit_id,
                meta_data={
                    "remix_prompt": request.prompt,
                    "remix_method": "composite",
                    "source": "remix",
                    "parent_id": asset_id,
                },
            )
            db.add(new_asset)
            new_assets.append(new_asset)

        db.commit()
        for a in new_assets:
            db.refresh(a)
            logger.info(f"[ASSETS-REMIX] ✓ Created remix asset {a.id} from parent {asset_id} at {a.file_path}")

        return new_assets

    except HTTPException:
        raise
    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"[ASSETS-REMIX] ✗ Failed remix for asset {asset_id}: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Remix failed: {error_msg}")

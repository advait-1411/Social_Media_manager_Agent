"""
overlay_service.py — Logo / Trademark Overlay Service

Applies logo/trademark KitAsset images onto a generated image as a
post-processing compositing step.

Architecture rules:
  - Overlay happens AFTER image generation.
  - Overlay happens AFTER any image editing step.
  - Only KitAsset rows with asset_type='logo_trademark' (usable_for_overlay=True)
    are valid inputs here.
  - This service MUST NOT be called before generation is complete.

LOGO_SAFETY_RULE: This is the only place logos enter the pipeline.
They are composited onto the final image, not sent to the AI model.
"""

import os
import uuid
import logging
from typing import Optional
from PIL import Image

from ..models.models import KitAsset

logger = logging.getLogger(__name__)

OUTPUT_DIR = "generated_images"


def apply_logo_overlay(
    base_image_path: str,
    overlay_asset: KitAsset,
    position: str = "BOTTOM-RIGHT-CORNER",
    logo_scale: float = 0.20,
    output_dir: str = OUTPUT_DIR,
) -> str:
    """
    Composite a logo/trademark onto a base image.

    Args:
        base_image_path: Path to the generated (or edited) image.
        overlay_asset:   A KitAsset with asset_type='logo_trademark'.
        position:        One of TOP-LEFT, TOP-RIGHT, BOTTOM-LEFT, BOTTOM-RIGHT (default),
                         TOP-CENTER, BOTTOM-CENTER.
        logo_scale:      Logo width as fraction of base image width (default 20%).
        output_dir:      Where to save the composited image.

    Returns:
        Path to the composited output image.

    Raises:
        ValueError: if overlay_asset.asset_type is not 'logo_trademark'.
        FileNotFoundError: if base or logo file is missing.
    """
    # Enforce type safety — logo_trademark ONLY
    if overlay_asset.asset_type != "logo_trademark":
        raise ValueError(
            f"[OVERLAY] Attempted overlay with asset_type='{overlay_asset.asset_type}' "
            f"(id={overlay_asset.id}). Only 'logo_trademark' assets may be overlaid."
        )

    if not os.path.exists(base_image_path):
        raise FileNotFoundError(f"[OVERLAY] Base image not found: {base_image_path}")

    logo_path = overlay_asset.file_path
    if not os.path.exists(logo_path):
        raise FileNotFoundError(f"[OVERLAY] Logo file not found: {logo_path}")

    os.makedirs(output_dir, exist_ok=True)

    with Image.open(base_image_path) as base_img:
        # Work in RGBA
        if base_img.mode not in ("RGB", "RGBA"):
            base_img = base_img.convert("RGBA")
        elif base_img.mode == "RGB":
            base_img = base_img.convert("RGBA")

        base_w, base_h = base_img.size
        margin = int(base_w * 0.05)

        with Image.open(logo_path) as logo_img:
            if logo_img.mode != "RGBA":
                logo_img = logo_img.convert("RGBA")

            # Scale logo to logo_scale fraction of base width
            target_logo_w = int(base_w * logo_scale)
            aspect = logo_img.height / logo_img.width
            target_logo_h = int(target_logo_w * aspect)
            logo_resized = logo_img.resize(
                (target_logo_w, target_logo_h), Image.Resampling.LANCZOS
            )

            # Calculate paste position
            pos_str = position.upper()
            if "TOP-LEFT" in pos_str:
                pos = (margin, margin)
            elif "TOP-RIGHT" in pos_str:
                pos = (base_w - target_logo_w - margin, margin)
            elif "BOTTOM-LEFT" in pos_str:
                pos = (margin, base_h - target_logo_h - margin)
            elif "TOP-CENTER" in pos_str:
                pos = ((base_w - target_logo_w) // 2, margin)
            elif "BOTTOM-CENTER" in pos_str:
                pos = ((base_w - target_logo_w) // 2, base_h - target_logo_h - margin)
            else:
                # Default: BOTTOM-RIGHT
                pos = (base_w - target_logo_w - margin, base_h - target_logo_h - margin)

            # Paste using alpha channel
            base_img.paste(logo_resized, pos, mask=logo_resized)
            logger.info(
                f"[OVERLAY] Applied logo '{overlay_asset.name}' "
                f"(id={overlay_asset.id}) at {pos_str}"
            )

        # Save composite as JPEG
        composite = base_img.convert("RGB")
        out_filename = f"overlay_{uuid.uuid4().hex}.jpg"
        out_path = os.path.join(output_dir, out_filename)
        composite.save(out_path, "JPEG", quality=95)
        logger.info(f"[OVERLAY] Saved composited image to {out_path}")

    return out_path


def apply_overlays_from_kit_assets(
    base_image_path: str,
    overlay_assets: list,  # list[KitAsset]
    output_dir: str = OUTPUT_DIR,
) -> str:
    """
    Apply multiple logo/trademark overlays sequentially.
    Each subsequent overlay is applied on top of the previous composite.

    If overlay_assets is empty, returns base_image_path unchanged.

    This is the main entry point called by the generation pipeline.
    """
    if not overlay_assets:
        logger.info("[OVERLAY] No overlay assets — returning base image unchanged.")
        return base_image_path

    current_path = base_image_path
    for asset in overlay_assets:
        try:
            current_path = apply_logo_overlay(
                base_image_path=current_path,
                overlay_asset=asset,
                output_dir=output_dir,
            )
        except Exception as e:
            logger.error(
                f"[OVERLAY] Failed to apply overlay asset id={asset.id}: {e}. "
                "Continuing with previous composite."
            )

    return current_path

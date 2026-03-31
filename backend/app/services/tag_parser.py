"""
tag_parser.py — AI Mode @mention tag resolver

Parses user input for @tag references, resolves them to KitAsset rows,
and infers which Product Kit the generation request should use.

Business rules enforced here:
  - If all resolved assets belong to one Product Kit  → infer that kit.
  - If assets span multiple kits → raise AmbiguousKitError (caller must ask user).
  - Resolved assets are split into two buckets:
      • generation_assets   (asset_type='product_asset')
      • overlay_assets      (asset_type='logo_trademark')
  The caller MUST only pass generation_assets to the image generation service.
  overlay_assets are returned separately for the post-generation overlay step.
"""

import re
import logging
from typing import Optional
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from ..models.models import KitAsset, BrandKit

logger = logging.getLogger(__name__)

# Regex: match @word tokens (alphanumeric, hyphens, underscores)
_TAG_RE = re.compile(r"@([\w][\w\-]*)", re.UNICODE)


def _normalize_token(text: str) -> str:
    """
    Normalize user-entered name or raw @tag into a lookup token.
    'Nike Hypervenom Neon Pink 1' → 'nike-hypervenom-neon-pink-1'
    '@nike-hypervenom-neon-pink1' → 'nike-hypervenom-neon-pink1'
    """
    text = text.lstrip("@").strip().lower()
    # Replace spaces and underscores with hyphens
    text = re.sub(r"[\s_]+", "-", text)
    # Remove any character that is not alphanumeric or hyphen
    text = re.sub(r"[^a-z0-9\-]", "", text)
    return text


def make_token_from_name(name: str) -> str:
    """Public helper: generate a canonical token from a user-entered asset name."""
    return _normalize_token(name)


class AmbiguousKitError(Exception):
    """Raised when @tagged assets resolve to more than one Product Kit."""

    def __init__(self, kit_ids: list[int]):
        self.kit_ids = kit_ids
        super().__init__(
            f"Tagged assets belong to multiple Product Kits ({kit_ids}). "
            "Please specify which Product Kit to use."
        )


class NoProductAssetsError(Exception):
    """Raised when only logo/trademark tags are present and no product assets."""

    def __init__(self):
        super().__init__(
            "No product assets were tagged. Please include at least one "
            "@product-asset to generate an image."
        )


@dataclass
class ParsedTagResult:
    """Result of resolving @tags in a user message."""
    raw_tags: list[str] = field(default_factory=list)
    generation_assets: list[KitAsset] = field(default_factory=list)   # product_asset type
    overlay_assets: list[KitAsset] = field(default_factory=list)       # logo_trademark type
    inferred_kit_id: Optional[int] = None
    inferred_kit: Optional[BrandKit] = None
    unresolved_tags: list[str] = field(default_factory=list)


def parse_and_resolve_tags(text: str, db: Session) -> ParsedTagResult:
    """
    Extract @tags from text, resolve them to KitAsset rows, infer Product Kit.

    Raises:
        AmbiguousKitError: if tags span multiple Product Kits.
        NoProductAssetsError: if only logo/trademark tags are found (no product assets).

    Returns:
        ParsedTagResult with separate buckets for generation vs overlay assets.
    """
    result = ParsedTagResult()

    # 1. Extract raw tag strings
    raw_tags = _TAG_RE.findall(text)
    result.raw_tags = raw_tags
    if not raw_tags:
        return result

    # 2. Resolve each tag to a KitAsset
    all_kit_ids: set[int] = set()

    for raw in raw_tags:
        token = _normalize_token(raw)
        kit_asset = (
            db.query(KitAsset)
            .filter(KitAsset.token == token)
            .first()
        )
        if kit_asset is None:
            logger.warning(f"[TAG_PARSER] Unresolved tag @{raw} (token='{token}')")
            result.unresolved_tags.append(raw)
            continue

        all_kit_ids.add(kit_asset.product_kit_id)

        # Split into correct bucket based on type
        if kit_asset.asset_type == "product_asset":
            result.generation_assets.append(kit_asset)
        elif kit_asset.asset_type == "logo_trademark":
            # LOGO_SAFETY_RULE: logo_trademark assets go into overlay_assets only.
            # They must NOT be included in generation_assets.
            result.overlay_assets.append(kit_asset)
        else:
            logger.warning(f"[TAG_PARSER] Unknown asset_type='{kit_asset.asset_type}' for tag @{raw}")

    # 3. Safeguard: only logos/trademarks → cannot generate
    total_generation = len(result.generation_assets)
    total_overlay = len(result.overlay_assets)
    if total_overlay > 0 and total_generation == 0:
        raise NoProductAssetsError()

    # 4. Infer Product Kit from resolved assets
    if len(all_kit_ids) > 1:
        raise AmbiguousKitError(sorted(all_kit_ids))

    if all_kit_ids:
        inferred_kit_id = next(iter(all_kit_ids))
        result.inferred_kit_id = inferred_kit_id
        result.inferred_kit = db.query(BrandKit).filter(BrandKit.id == inferred_kit_id).first()

    logger.info(
        f"[TAG_PARSER] Resolved {len(raw_tags)} tags → "
        f"{len(result.generation_assets)} product_assets, "
        f"{len(result.overlay_assets)} logo_trademarks, "
        f"{len(result.unresolved_tags)} unresolved. "
        f"Inferred kit_id={result.inferred_kit_id}"
    )

    return result

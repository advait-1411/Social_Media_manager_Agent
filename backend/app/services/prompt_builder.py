"""
prompt_builder.py – ONIDA Remix Prompt Assembly Service

Responsibilities:
  1. Hold the canonical ONIDA_SYSTEM_PROMPT constant — concise visual brand
     constraints expressed as image directives (NOT role-play instructions).
  2. Expose build_remix_prompt(user_prompt, asset_system_prompt) which
     assembles a direct, image-model–ready prompt combining:
       - The user's creative scene direction
       - The ONIDA visual constraints

Key distinction:
  The prompt sent to the image model must be a SCENE DESCRIPTION, not
  instructional text telling the model "how to behave". Image models like
  gemini-2.5-flash-image ignore role-play framing and just describe what
  they see — so we write a prompt that already describes the image we want.
"""

import logging

logger = logging.getLogger(__name__)



# ── Prompt builder ─────────────────────────────────────────────────────────────
_SHORT_PROMPT_THRESHOLD = 10  # characters


from typing import Optional

def build_remix_prompt(user_prompt: str, system_prompt: Optional[str] = None) -> str:
    """
    Build a direct image-generation prompt to send to the image model.

    The output is a natural-language scene description — NOT an instruction
    or role-play wrapper. Image models generate what the prompt describes,
    so we describe the scene and inline brand constraints.

    Args:
        user_prompt:         The creative direction typed by the marketer
                             (e.g. "Diwali living room with warm fairy lights").
        system_prompt:       Per-asset visual brand constraints.

    Returns:
        A single string suitable as a direct image-generation prompt.
    """
    brand_constraints = (system_prompt or "").strip()

    user_prompt = (user_prompt or "").strip()

    # ── Edge case: no user intent provided ───────────────────────────────────
    if not user_prompt:
        logger.info("[PROMPT_BUILDER] user_prompt is empty — generating from brand constraints only")
        brand_suffix = f" {brand_constraints}" if brand_constraints else ""
        return (
            "Generate a premium, photorealistic, ad-ready background scene for an ONIDA "
            "product advertisement suitable for Indian social media."
            f"{brand_suffix}"
        )

    # ── Edge case: very short / vague user intent ─────────────────────────────
    if len(user_prompt) < _SHORT_PROMPT_THRESHOLD:
        logger.info(
            f"[PROMPT_BUILDER] user_prompt is short ({len(user_prompt)} chars) — "
            "expanding into full scene description"
        )
        user_prompt = (
            f"A premium product advertisement scene with a {user_prompt} mood and atmosphere, "
            "suitable for Indian social and digital platforms"
        )

    # ── Standard image prompt ─────────────────────────────────────────────────
    # Written as a scene description the image model will render directly.
    if brand_constraints:
        final_prompt = f"{brand_constraints}\n\n{user_prompt}"
    else:
        final_prompt = user_prompt

    logger.info(
        f"[PROMPT_BUILDER] Built image prompt "
        f"(user={len(user_prompt)} chars, constraints={len(brand_constraints)} chars, "
        f"total={len(final_prompt)} chars)"
    )
    return final_prompt

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

# ── Global ONIDA visual brand constraints ──────────────────────────────────────
# These are expressed as image directives, not meta-instructions.
# They get appended inline to every generated image prompt.
ONIDA_SYSTEM_PROMPT = """\
You are generating hyperreal, ad-ready visuals for ONIDA appliances, specifically optimized for Indian digital and social campaigns. \
\
CORE DIRECTIVE: \
Produce photorealistic, broadcast-quality, cinematic compositions that look indistinguishable from high-end commercial photography or big-brand key visuals for premium appliances. \
Every frame must pass the “could this be a real campaign still?” test. No obvious AI artifacts, no plastic-looking textures, no uncanny faces. \
\
PRODUCT HIERARCHY & PLACEMENT: \
The ONIDA appliance is the unambiguous hero of the image. \
The ONIDA logo and branding must remain pristine, undistorted, and clearly readable. \
The product should typically occupy 35–50% of the frame, with strong visual weight and clear separation from the background. \
Do not crop off or obscure the logo with props, text, or lighting. \
\
TV-SPECIFIC LOGIC & GUARDRAILS: \
When the product is an ONIDA TV, it must always be in a physically logical position: \
either on a proper TV unit or console in a living room or entertainment setup, or wall-mounted on or against a wall or panel. \
The TV must never float or be placed in nonsensical positions: never in mid-air, on a sofa, on a bed, on someone’s lap, or on random small objects. \
The scene should look like a believable living space or environment where a real TV would be installed. \
Maintain accurate proportions and perspective so the TV feels naturally integrated into the furniture and room. \
\
AC-SPECIFIC LOGIC & GUARDRAILS: \
When the product is an ONIDA air conditioner, it must always be mounted or placed in a way that an actual AC would be installed in a real home or office. \
Split AC units should be fixed high on a wall with a visible wall surface and realistic clearance from the ceiling; avoid floating units, ACs placed on the floor, on furniture, or in mid-air. \
Window AC units should be embedded in a window or wall opening, never sitting on tables, beds, or random surfaces. \
Ensure the indoor unit, vents, and grille orientation follow real-world physics: cool air should appear to flow downward or outward into the room, not upward in an illogical direction. \
Do not show water leaking indoors, exposed wiring, or any unsafe or absurd installation; the overall scene must look like a neat, professional AC setup that a technician would approve. \
\
LIGHTING & REALISM: \
Use soft-to-dramatic three-point lighting (key, fill, and rim or accent) appropriate to the scene. \
Shadows must be natural, with realistic falloff and contact shadows under and behind the product. \
Add believable specular highlights on glass, metal, and glossy surfaces to convey material authenticity. \
Use shallow depth of field where appropriate: the product is tack-sharp, background tastefully soft, like professional product photography. \
Avoid flat, clinical catalog lighting; aim for editorial or cinematic lighting with controlled contrast, suitable for premium campaigns. \
\
ENVIRONMENT & CONTEXT: \
Place the product in a thoughtfully styled, aspirational environment, such as modern Indian home interiors, premium living rooms, bedrooms, or context-appropriate spaces. \
Use complementary props and decor that enhance the narrative but do not steal focus from the product. \
Surfaces and materials must be believable: visible wood grain, fabric texture, stone or marble veining, and glass reflections. \
Maintain sufficient negative space so the image never feels cramped or cluttered; leave room for overlay text. \
\
COLOR GRADING & TONE: \
Color grading should be rich but controlled, tuned for Indian digital and social feeds. \
Keep skin tones (if any) and product colors natural and accurate, with no heavy filters. \
A slight cinematic grade with subtle contrast and tasteful warmth or coolness is acceptable if contextually appropriate. \
Avoid cartoonish saturation, neon overload, or extreme color filters that make the scene look fake. \
If the user prompt references a festival or mood (such as Holi, Diwali, summer, or cricket season), reflect it primarily in the environment and lighting, not by over-tinting the product. \
\
COMPOSITION & TEXT SPACE: \
Use rule-of-thirds or dynamic asymmetrical composition to create depth and visual interest. \
Build clear foreground, midground, and background layers, with the ONIDA product as the focal point. \
Reserve roughly 15–25 percent of the frame as clean space, typically at the top or side, for campaign headlines and copy. \
This zone should have minimal busy detail and high readability. \
\
STRICT EXCLUSIONS & SAFETY: \
No “woke” messaging, social-justice iconography, or ideological symbolism of any kind. \
No competitor logos or brands (for example Samsung, LG, Sony, Voltas, Daikin, IFB, Godrej, and similar). \
No watermarks, model UI overlays, fake branding labels, or on-image text generated by the model. \
No gore, nudity, sexually suggestive poses, drugs, alcohol-focus, hate symbols, or political content. \
No surreal or illogical physics: products must not float, melt, or morph. \
No impossible reflections, impossible geometry, or dreamlike distortions unless explicitly and safely requested, and even then the product must remain logically composed. \
Faces, if present, must look natural and non-uncanny; avoid distorted eyes, hands, or expressions. \
\
OUTPUT STANDARD: \
Final images must be campaign-grade: suitable for use as key visuals in ONIDA’s digital ads, social posts, or hero sections on websites. \
Prioritize clarity, trustworthiness, and aspirational quality over extreme stylization. \
If any element looks synthetic, glitchy, or illogical, you should internally iterate toward greater photorealism and coherence, while keeping the ONIDA product as the hero.\
"""

# ── Prompt builder ─────────────────────────────────────────────────────────────
_SHORT_PROMPT_THRESHOLD = 10  # characters


def build_remix_prompt(user_prompt: str, asset_system_prompt: str | None = None) -> str:
    """
    Build a direct image-generation prompt to send to the image model.

    The output is a natural-language scene description — NOT an instruction
    or role-play wrapper. Image models generate what the prompt describes,
    so we describe the scene and inline brand constraints.

    Args:
        user_prompt:         The creative direction typed by the marketer
                             (e.g. "Diwali living room with warm fairy lights").
        asset_system_prompt: Per-asset visual brand constraints. Falls back
                             to ONIDA_SYSTEM_PROMPT when None or empty.

    Returns:
        A single string suitable as a direct image-generation prompt.
    """
    brand_constraints = (asset_system_prompt or "").strip() or ONIDA_SYSTEM_PROMPT

    user_prompt = (user_prompt or "").strip()

    # ── Edge case: no user intent provided ───────────────────────────────────
    if not user_prompt:
        logger.info("[PROMPT_BUILDER] user_prompt is empty — generating from brand constraints only")
        return (
            "Generate a premium, photorealistic, ad-ready background scene for an ONIDA "
            "product advertisement suitable for Indian social media. "
            f"{brand_constraints}"
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
    final_prompt = f"{brand_constraints}\n\n{user_prompt}"

    logger.info(
        f"[PROMPT_BUILDER] Built image prompt "
        f"(user={len(user_prompt)} chars, constraints={len(brand_constraints)} chars, "
        f"total={len(final_prompt)} chars)"
    )
    return final_prompt

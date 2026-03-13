import os
import json
import re
from typing import Optional, Dict, Any, List, TYPE_CHECKING
from openai import AzureOpenAI, OpenAI
import logging
import uuid

if TYPE_CHECKING:
    from ..schemas.campaigns import CampaignGenerationRequest, CampaignGenerationResponse

logger = logging.getLogger(__name__)

def get_azure_client():
    """Initialize Azure OpenAI client for comment analysis."""
    return AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2025-01-01-preview")
    )

def get_openrouter_client():
    """Initialize OpenRouter client for caption generation."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY environment variable is not set")
    
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key
    )

async def generate_caption(prompt: str, platform: str = "instagram", tone: str = "professional") -> str:
    """
    Generate a social media caption using OpenRouter.
    """
    try:
        client = get_openrouter_client()
        model = os.getenv("OPENROUTER_MODEL_CAPTION", "openai/gpt-4o-mini")
        
        system_prompt = f"""You are a social media content expert. Generate engaging {platform} captions.
        
Rules:
- Platform: {platform}
- Tone: {tone}
- Write a complete caption based on the user's input.
- Include relevant hashtags at the end for Instagram (but keep them visually separated).
- Keep it concise but engaging.
- Add appropriate emojis.
- For LinkedIn: more professional, no excessive hashtags, focus on value.
- For Twitter/X: respect character limits (280 chars), 1-2 hashtags max.
"""
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate a caption for: {prompt}"}
            ],
            max_tokens=512,  # captions + hashtags
            temperature=0.7
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        logger.error(f"OpenRouter error in generate_caption: {e}")
        raise e

async def repurpose_caption(original_caption: str, target_platform: str) -> str:
    """
    Repurpose a caption for a different platform using OpenRouter.
    """
    try:
        client = get_openrouter_client()
        model = os.getenv("OPENROUTER_MODEL_CAPTION", "openai/gpt-4o-mini")
        
        platform_guidelines = {
            "instagram": "Use hashtags at the end, emojis throughout, casual/friendly tone, can be longer",
            "linkedin": "Professional tone, fewer emojis, focus on value/insights, minimal hashtags",
            "twitter": "Concise (under 280 chars ideally), conversational, 1-2 hashtags max",
            "threads": "Conversational, can be part of a thread, engaging questions welcome",
        }
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": f"Repurpose this social media caption for {target_platform}. Guidelines: {platform_guidelines.get(target_platform, 'Keep it engaging')}"},
                {"role": "user", "content": original_caption}
            ],
            max_tokens=512,  # captions + hashtags
            temperature=0.7
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        logger.error(f"OpenRouter error in repurpose_caption: {e}")
        raise e

async def suggest_hashtags(content: str, platform: str = "instagram", count: int = 10) -> list:
    """
    Suggest relevant hashtags using OpenRouter.
    """
    try:
        client = get_openrouter_client()
        model = os.getenv("OPENROUTER_MODEL_CAPTION", "openai/gpt-4o-mini")
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": f"Generate exactly {count} relevant hashtags for {platform}. Return only the hashtags, one per line, including the # symbol."},
                {"role": "user", "content": content}
            ],
            max_tokens=256,  # short list of hashtags
            temperature=0.5
        )
        
        hashtags = response.choices[0].message.content.strip().split('\n')
        return [h.strip() for h in hashtags if h.startswith('#')]
        
    except Exception as e:
        logger.error(f"OpenRouter error in suggest_hashtags: {e}")
        raise e


async def analyze_comment(text: str) -> Dict[str, str]:
    """
    Analyze a comment to determine sentiment and category using Azure OpenAI.
    
    Args:
        text: Comment text to analyze
    
    Returns:
        Dictionary with 'sentiment' and 'category' keys
    """
    try:
        client = get_azure_client()
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "MMNext-gpt-4o")
        
        system_prompt = """You are a social media comment analyzer. Analyze the given comment and classify it.

Return a JSON object with exactly these two keys:
- "sentiment": one of "positive", "neutral", "negative", or "unknown"
- "category": one of "question", "complaint", "spam", "praise", or "general"

Return ONLY valid JSON, no markdown code blocks, no explanation, just the JSON object.
Example: {"sentiment": "positive", "category": "praise"}
"""
        
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Analyze this comment: {text}"}
            ],
            max_tokens=256,  # short JSON sentiment analysis
            temperature=0.3
        )
        
        content = response.choices[0].message.content.strip()
        
        # Remove markdown code fences if present
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
        
        try:
            # Try to extract JSON from the content
            # Look for JSON object pattern
            json_match = re.search(r'\{[^}]+\}', content)
            if json_match:
                content = json_match.group(0)
            
            result = json.loads(content)
            
            # Validate keys
            sentiment = result.get("sentiment", "unknown")
            category = result.get("category", "general")
            
            # Validate values
            if sentiment not in ["positive", "neutral", "negative", "unknown"]:
                sentiment = "unknown"
            if category not in ["question", "complaint", "spam", "praise", "general"]:
                category = "general"
            
            return {
                "sentiment": sentiment,
                "category": category
            }
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse AI analysis result as JSON: {content}")
            return {"sentiment": "unknown", "category": "general"}
        except Exception as e:
            logger.warning(f"Error parsing AI analysis result: {str(e)}")
            return {"sentiment": "unknown", "category": "general"}
        
    except Exception as e:
        logger.error(f"Comment analysis error: {e}")
        return {"sentiment": "unknown", "category": "general"}


async def generate_comment_reply(comment_text: str, post_caption: Optional[str] = None, tone: str = "friendly") -> str:
    """
    Generate an AI-powered reply suggestion for a comment.
    
    Args:
        comment_text: The comment text to reply to
        post_caption: Optional post caption for context
        tone: Tone for the reply (default: "friendly")
    
    Returns:
        Suggested reply text
    """
    try:
        client = get_azure_client()
        deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "MMNext-gpt-4o")
        
        context = f"Original post caption: {post_caption}" if post_caption else "No post context available"
        
        system_prompt = f"""You are a social media community manager for Instagram. Generate a friendly, on-brand reply to user comments.

Guidelines:
- Be concise and friendly
- Match the {tone} tone
- Do not over-promise or make commitments you can't keep
- Avoid sensitive topics or controversial statements
- Keep it authentic and human-sounding
- Use appropriate emojis sparingly
- If the comment is a question, provide a helpful answer
- If it's praise, thank them genuinely
- If it's a complaint, acknowledge and offer help

Return only the reply text, no explanations or additional formatting."""
        
        user_message = f"Comment to reply to: {comment_text}\n\n{context}\n\nGenerate a {tone} reply:"
        
        response = client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=256,  # short reply to one comment
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Comment reply generation error: {e}")
        raise e




# ---------------------------------------------------------------------------
# Image Overlay Planner AI service
# ---------------------------------------------------------------------------

async def get_image_overlay_plan(user_prompt: str) -> Dict[str, str]:
    """
    Analyzes an image generation prompt to determine the best ONIDA logo placement
    and generates a minimalist ad caption to be overlaid on the image.

    Returns a dict with:
      - logo_position: e.g. "BOTTOM-RIGHT-CORNER"
      - caption_text: Short, professional ad text
      - caption_position: e.g. "TOP-CENTER"
    """
    try:
        client = get_openrouter_client()
        model = os.getenv("OPENROUTER_MODEL_CAPTION", "openai/gpt-4o-mini")

        schema_example = {
            "logo_position": "BOTTOM-RIGHT-CORNER",
            "caption_text": "Experience Real Surround Sound.",
            "caption_position": "TOP-CENTER"
        }

        system_prompt = f'''You are an expert art director for ONIDA appliances.
Your job is to read an image generation scene prompt and decide where to place the ONIDA logo and an overlaid text caption.

Return ONLY a valid JSON object matching this schema:
{json.dumps(schema_example, indent=2)}

Rules for logo_position:
- Choose from: TOP-CENTER, TOP-LEFT-CORNER, TOP-RIGHT-CORNER, BOTTOM-CENTER, BOTTOM-LEFT-CORNER, BOTTOM-RIGHT-CORNER.
- Choose a position that is absurd or illogical but don't overthink it, unless the user explicitly mentions a position.
- Never choose a position that would predictably cover the main subject described in the prompt.

Rules for caption_text:
- A subtle, minimalistic, realistic, professional, ad-brand-friendly caption.
- Keep it under 8 words.
- Relate it directly to the user's prompt (e.g., if prompt mentions Diwali, mention the festival of lights; if it's a beach scene, mention cool breeze).

Rules for caption_position:
- Choose from: TOP-CENTER, TOP-LEFT-CORNER, TOP-RIGHT-CORNER, BOTTOM-CENTER, BOTTOM-LEFT-CORNER, BOTTOM-RIGHT-CORNER.
- MUST NOT be the same as the logo_position. Usually placing it on the opposite vertical end works best (e.g., Logo at Bottom, Caption at Top).
'''

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Image generation prompt: {user_prompt}"}
            ],
            max_tokens=256,
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()

        # Clean markdown code blocks
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        try:
            json_match = re.search(r'\{[^}]+\}', content)
            if json_match:
                content = json_match.group(0)
            
            result = json.loads(content)
            
            # Defaults
            logo_pos = result.get("logo_position", "BOTTOM-RIGHT-CORNER")
            caption_text = result.get("caption_text", "ONIDA. Owner's Pride.")
            caption_pos = result.get("caption_position", "TOP-CENTER")

            valid_positions = [
                "TOP-CENTER", "TOP-LEFT-CORNER", "TOP-RIGHT-CORNER",
                "BOTTOM-CENTER", "BOTTOM-LEFT-CORNER", "BOTTOM-RIGHT-CORNER"
            ]
            if logo_pos not in valid_positions: logo_pos = "BOTTOM-RIGHT-CORNER"
            if caption_pos not in valid_positions: caption_pos = "TOP-CENTER"

            return {
                "logo_position": logo_pos,
                "caption_text": caption_text,
                "caption_position": caption_pos
            }

        except json.JSONDecodeError:
            logger.warning(f"Failed to parse overlay plan JSON: {content}")
            return {"logo_position": "BOTTOM-RIGHT-CORNER", "caption_text": "ONIDA.", "caption_position": "TOP-CENTER"}

    except Exception as e:
        logger.error(f"Image overlay planner error: {e}")
        return {"logo_position": "BOTTOM-RIGHT-CORNER", "caption_text": "ONIDA.", "caption_position": "TOP-CENTER"}


# ---------------------------------------------------------------------------
# Campaign Generator AI service
# ---------------------------------------------------------------------------

async def generate_campaigns_via_ai(request, assets: list):
    """
    Generate a multi-campaign content plan using OpenRouter (gpt-4o-mini).

    Args:
        request: The validated CampaignGenerationRequest from the API layer.
        assets:  List of Asset ORM rows whose IDs appear in request.asset_ids.

    Returns:
        A validated CampaignGenerationResponse with campaign blueprints.

    Raises:
        ValueError: when the model returns malformed JSON.
        Any OpenAI SDK exception on network / auth failures.
    """
    from ..schemas.campaigns import CampaignFile, CampaignGenerationResponse, PostBlueprint  # local import avoids circular deps
    import uuid
    from datetime import datetime, timezone

    client = get_openrouter_client()
    model  = os.getenv("OPENROUTER_MODEL_CAPTION", "openai/gpt-4o-mini")

    # ------------------------------------------------------------------
    # Build asset summaries for the prompt
    # ------------------------------------------------------------------
    asset_lines: List[str] = []
    for a in assets:
        tags_str   = ", ".join(a.tags or []) if a.tags else ""
        prompt_str = a.prompt or "(no description)"
        line = f"  - Asset ID {a.id}: {prompt_str[:200]}"
        if tags_str:
            line += f" | tags: {tags_str[:100]}"
        asset_lines.append(line)

    logo_line = ""
    if request.logo_id:
        logo_line = f"\nLogo Asset ID: {request.logo_id} – always reference this as the brand logo."

    assets_block = "\n".join(asset_lines) if asset_lines else "  (none provided)"

    # ------------------------------------------------------------------
    # Build guidelines block
    # ------------------------------------------------------------------
    guidelines_block = ""
    if request.guidelines and isinstance(request.guidelines, dict):
        g = request.guidelines
        parts = []
        if g.get("tone"):
            parts.append(f"Tone: {g['tone']}")
        if g.get("colors"):
            parts.append(f"Brand colors: {', '.join(g['colors'])}")
        if g.get("banned_words"):
            parts.append(f"BANNED words (never use): {', '.join(g['banned_words'])}")
        if g.get("legal_footer"):
            parts.append(f'Legal footer (append to every caption): "{g["legal_footer"]}"')
        guidelines_block = "\n".join(parts)
    else:
        guidelines_block = "No specific brand guidelines provided; use a professional, friendly tone."

    platforms_str = ", ".join(request.platforms)
    business_ctx  = request.business_context or "Not provided."

    # ------------------------------------------------------------------
    # Build the JSON schema example for the model
    # ------------------------------------------------------------------
    schema_example = {
        "campaigns": [
            {
                "title": "Campaign Title",
                "strategy": "One-paragraph description of the campaign angle / hook.",
                "posts": [
                    {
                        "blueprint_id": "<uuid-string>",
                        "platform": "instagram",
                        "asset_id": None,
                        "image_prompt": "A bright flat-lay of the product on a white marble surface.",
                        "caption": "Your ready-to-post caption here...",
                        "hashtags": ["#YourBrand", "#ProductLaunch"]
                    }
                ]
            }
        ]
    }

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------
    system_prompt = f"""You are VelvetQueue's Campaign Strategist AI.
Your job is to generate {request.num_campaigns} distinct social-media campaign blueprints for a brand.

## Your output MUST be valid JSON that matches this exact schema - nothing else:
{json.dumps(schema_example, indent=2)}

## Rules
1. Return ONLY the JSON object. No markdown fences, no extra text, no explanations.
2. Generate exactly {request.num_campaigns} campaign objects, each with approximately {request.posts_per_campaign} posts.
3. Every "blueprint_id" field in posts must be a unique UUID4 string.
4. Assign posts to the platforms listed ({platforms_str}). Distribute posts across platforms where sensible.
5. For each post, either set "asset_id" to an existing Asset ID from the provided list OR leave it null and provide an "image_prompt".
6. All captions must be platform-appropriate:
   - instagram: engaging, emojis OK, hashtags at the end.
   - linkedin: professional, value-driven, minimal hashtags (max 3), use "link in comments" not "link in bio".
   - twitter: under 240 characters (caption only, excluding hashtags), 1-2 hashtags max.
7. Include 3-10 relevant hashtags per post (with # prefix).

## CONTENT GUARDRAILS (strictly enforce):
- NO celebrities, public figures, or real people.
- NO references to competitor brands or products.
- NO copyrighted characters, slogans, or logos.
- NO offensive, discriminatory, or NSFW content.
- Keep all content family-safe and brand-appropriate.
- Treat uploaded assets as generic product images; do not assume brand names unless provided.
"""

    # ------------------------------------------------------------------
    # User prompt
    # ------------------------------------------------------------------
    user_prompt = f"""## Campaign Brief

**Business context:** {business_ctx}

**Campaign idea / theme:** {request.prompt}

**Target platforms:** {platforms_str}

**Available brand assets:**
{assets_block}{logo_line}

**Brand guidelines:**
{guidelines_block}

Generate the campaign JSON now."""

    # ------------------------------------------------------------------
    # API call
    # ------------------------------------------------------------------
    logger.info(f"[CAMPAIGNS AI] Calling {model} for campaign generation (num_campaigns={request.num_campaigns})")

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=1024,  # multi-campaign JSON blueprint
        temperature=0.8,
    )

    raw_content = response.choices[0].message.content.strip()
    logger.info(f"[CAMPAIGNS AI] Received {len(raw_content)} chars from model.")

    # ------------------------------------------------------------------
    # Parse & validate
    # ------------------------------------------------------------------
    # Strip accidental markdown code fences
    if raw_content.startswith("```"):
        raw_content = re.sub(r"^```[a-z]*\n?", "", raw_content)
        raw_content = re.sub(r"\n?```$", "", raw_content.strip())

    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        logger.error(f"[CAMPAIGNS AI] JSON parse failed: {exc}\nRaw snippet: {raw_content[:500]}")
        raise ValueError(
            f"The AI returned malformed JSON ({exc}). "
            "Try rephrasing your prompt or regenerate."
        )

    # Build CampaignFile objects manually so we can assign proper IDs and timestamps
    now = datetime.now(timezone.utc)
    campaign_files: list = []
    try:
        raw_campaigns = data.get("campaigns", data if isinstance(data, list) else [])
        for c in raw_campaigns:
            posts = []
            for p in c.get("posts", []):
                # Accept both "blueprint_id" (new) and "id" (old model output) to be safe
                bid = p.get("blueprint_id") or p.get("id") or str(uuid.uuid4())
                posts.append(PostBlueprint(
                    blueprint_id=bid,
                    platform=p.get("platform", "instagram"),
                    asset_id=p.get("asset_id"),
                    image_prompt=p.get("image_prompt"),
                    caption=p.get("caption", ""),
                    hashtags=p.get("hashtags", []),
                    status="blueprint",
                ))
            campaign_files.append(CampaignFile(
                id=str(uuid.uuid4()),
                title=c.get("title", "Campaign"),
                strategy=c.get("strategy", ""),
                created_at=now,
                updated_at=now,
                business_context=request.business_context,
                guidelines=request.guidelines if isinstance(request.guidelines, dict) else None,
                platforms=request.platforms,
                posts=posts,
            ))
    except Exception as exc:
        logger.error(f"[CAMPAIGNS AI] Schema build failed: {exc}")
        raise ValueError(f"AI response did not match the expected schema: {exc}. Please try again.")

    return CampaignGenerationResponse(campaigns=campaign_files)

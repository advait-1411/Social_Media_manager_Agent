import os
import json
import re
from typing import Optional, Dict, Any
from openai import AzureOpenAI, OpenAI
import logging

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
            max_tokens=500,
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
            max_tokens=500,
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
            max_tokens=200,
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
            max_tokens=100,
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
            max_tokens=200,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Comment reply generation error: {e}")
        raise e


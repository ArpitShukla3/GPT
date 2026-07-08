"""
Routes for the Smart Cart feature.

- POST /instant-cart          — Text-based cart generation
- POST /instant-cart-multimodal — Image + text cart generation
- POST /checkout-and-learn    — Record purchase & learn preferences
- POST /transcribe            — Transcribe audio using Gemini
"""

import logging

import google.generativeai as genai

from app.core.config import settings

from fastapi import APIRouter, File, Form, UploadFile

from app.schemas.cart import (
    CartResponse,
    CheckoutRequest,
    CheckoutResponse,
    InstantCartRequest,
    MultimodalCartResponse,
)
from app.services.cart_service import CartGenerationService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cart"])


@router.post("/instant-cart", response_model=CartResponse)
async def instant_cart(request: InstantCartRequest):
    """
    Generate a personalized cart from natural language intent.

    Accepts a user_id and query, delegates to CartGenerationService.generate_cart(),
    and returns a CartResponse with cart_items, alternatives, and estimated_total.
    """
    return CartGenerationService.generate_cart(
        user_id=request.user_id,
        query=request.query,
    )


@router.post("/instant-cart-multimodal", response_model=MultimodalCartResponse)
async def instant_cart_multimodal(
    user_id: str = Form(..., description="User ID for preference lookup"),
    query: str = Form(..., description="Text query describing intent"),
    image: UploadFile = File(..., description="Image file (fridge photo, recipe, etc.)"),
):
    """
    Generate a personalized cart from an image + text query using Gemini Vision.

    Multimodal flow:
    1. Read image bytes and fetch user preferences
    2. Call Gemini 1.5 Flash with image + text + preferences to identify needed items
    3. Parse Gemini's structured JSON response into SemanticItem list
    4. For each semantic item, search the local product catalog
    5. Apply user brand preferences to select the best matching product
    6. Find alternatives for each item
    7. Return the assembled cart with reasoning, items, and alternatives
    """
    image_bytes = await image.read()
    return CartGenerationService.generate_cart_multimodal(
        user_id=user_id,
        query=query,
        image_bytes=image_bytes,
    )


@router.post("/checkout-and-learn", response_model=CheckoutResponse)
async def checkout_and_learn(request: CheckoutRequest):
    """
    Record purchase and update user preferences.

    Accepts a user_id and final_purchased_items, delegates to
    CartGenerationService.checkout(), and returns a CheckoutResponse.
    """
    return CartGenerationService.checkout(
        user_id=request.user_id,
        items=request.final_purchased_items,
    )


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio file to transcribe"),
):
    """
    Transcribe audio using Gemini Flash.
    Returns the transcribed text from the audio recording.
    """
    try:
        audio_bytes = await audio.read()
        content_type = audio.content_type or "audio/mp4"

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")

        response = model.generate_content(
            [
                "Transcribe this audio exactly. Return ONLY the transcribed text, nothing else. "
                "If you cannot understand the audio, return 'Could not transcribe'.",
                {"mime_type": content_type, "data": audio_bytes},
            ]
        )
        transcript = response.text.strip()
        return {"transcript": transcript}
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return {"transcript": "", "error": str(e)}

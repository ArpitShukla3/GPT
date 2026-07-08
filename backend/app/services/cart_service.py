"""
CartGenerationService — AI-powered cart generation.

Uses Google Gemini to parse natural language intent (text or image + text)
into structured shopping carts with alternatives.
"""

import json
import logging
from typing import Optional

from app.core.config import settings
from app.schemas.cart import (
    CartItem,
    CartResponse,
    CheckoutResponse,
    MultimodalCartResponse,
    PurchaseItem,
    SemanticItem,
)

logger = logging.getLogger(__name__)

# ── Product Catalog (mock data — replace with DB/vector search) ──
PRODUCT_CATALOG = [
    {"product_id": "MILK001", "name": "Amul Taaza Toned Milk 1L", "category": "Dairy", "brand": "Amul", "price": 56.0},
    {"product_id": "MILK002", "name": "Mother Dairy Full Cream Milk 1L", "category": "Dairy", "brand": "Mother Dairy", "price": 68.0},
    {"product_id": "MILK003", "name": "Nestle a+ Toned Milk 1L", "category": "Dairy", "brand": "Nestle", "price": 62.0},
    {"product_id": "EGG001", "name": "Farm Fresh White Eggs 12pcs", "category": "Eggs", "brand": "Farm Fresh", "price": 89.0},
    {"product_id": "EGG002", "name": "Eggoz Free Range Brown Eggs 6pcs", "category": "Eggs", "brand": "Eggoz", "price": 120.0},
    {"product_id": "BREAD001", "name": "Britannia Whole Wheat Bread 400g", "category": "Bakery", "brand": "Britannia", "price": 45.0},
    {"product_id": "BREAD002", "name": "Harvest Gold Multigrain Bread 450g", "category": "Bakery", "brand": "Harvest Gold", "price": 55.0},
    {"product_id": "COFFEE001", "name": "Nescafe Classic Instant Coffee 100g", "category": "Beverages", "brand": "Nescafe", "price": 275.0},
    {"product_id": "COFFEE002", "name": "Bru Gold Instant Coffee 100g", "category": "Beverages", "brand": "Bru", "price": 310.0},
    {"product_id": "COFFEE003", "name": "Continental Xtra Coffee 50g", "category": "Beverages", "brand": "Continental", "price": 165.0},
    {"product_id": "RICE001", "name": "India Gate Basmati Rice 5kg", "category": "Staples", "brand": "India Gate", "price": 640.0},
    {"product_id": "RICE002", "name": "Daawat Super Basmati Rice 5kg", "category": "Staples", "brand": "Daawat", "price": 599.0},
    {"product_id": "OIL001", "name": "Fortune Sunflower Oil 1L", "category": "Cooking Oil", "brand": "Fortune", "price": 180.0},
    {"product_id": "OIL002", "name": "Saffola Gold Blended Oil 1L", "category": "Cooking Oil", "brand": "Saffola", "price": 215.0},
    {"product_id": "SUGAR001", "name": "India Gate Crystal Sugar 1kg", "category": "Staples", "brand": "India Gate", "price": 48.0},
    {"product_id": "TEA001", "name": "Tata Tea Premium 500g", "category": "Beverages", "brand": "Tata Tea", "price": 275.0},
    {"product_id": "TEA002", "name": "Red Label Tea 500g", "category": "Beverages", "brand": "Red Label", "price": 265.0},
    {"product_id": "FRUIT001", "name": "Fresh Bananas 1 Dozen", "category": "Fruits", "brand": "Fresh", "price": 49.0},
    {"product_id": "FRUIT002", "name": "Shimla Apples 1kg", "category": "Fruits", "brand": "Fresh", "price": 180.0},
    {"product_id": "FRUIT003", "name": "Nagpur Oranges 1kg", "category": "Fruits", "brand": "Fresh", "price": 120.0},
    {"product_id": "VEG001", "name": "Fresh Tomatoes 1kg", "category": "Vegetables", "brand": "Fresh", "price": 40.0},
    {"product_id": "VEG002", "name": "Fresh Onions 1kg", "category": "Vegetables", "brand": "Fresh", "price": 35.0},
    {"product_id": "VEG003", "name": "Fresh Potatoes 1kg", "category": "Vegetables", "brand": "Fresh", "price": 30.0},
    {"product_id": "BUTTER001", "name": "Amul Butter 100g", "category": "Dairy", "brand": "Amul", "price": 56.0},
    {"product_id": "BUTTER002", "name": "Britannia Cheese Slices 200g", "category": "Dairy", "brand": "Britannia", "price": 110.0},
    {"product_id": "PASTA001", "name": "Maggi Pazzta Cheesy Tomato 64g", "category": "Instant Food", "brand": "Maggi", "price": 35.0},
    {"product_id": "NOODLE001", "name": "Maggi 2-Minute Noodles Pack of 12", "category": "Instant Food", "brand": "Maggi", "price": 152.0},
    {"product_id": "JUICE001", "name": "Tropicana Orange Juice 1L", "category": "Beverages", "brand": "Tropicana", "price": 120.0},
    {"product_id": "JUICE002", "name": "Real Mango Juice 1L", "category": "Beverages", "brand": "Real", "price": 110.0},
    {"product_id": "SNACK001", "name": "Lays Classic Salted Chips 90g", "category": "Snacks", "brand": "Lays", "price": 30.0},
    {"product_id": "SNACK002", "name": "Kurkure Masala Munch 100g", "category": "Snacks", "brand": "Kurkure", "price": 20.0},
]

# Build lookup indices
_CATALOG_BY_ID = {p["product_id"]: p for p in PRODUCT_CATALOG}
_CATALOG_BY_CATEGORY: dict[str, list[dict]] = {}
for _p in PRODUCT_CATALOG:
    _CATALOG_BY_CATEGORY.setdefault(_p["category"], []).append(_p)


def _search_products(query: str, top_k: int = 1) -> list[dict]:
    """Simple keyword search over catalog. Replace with vector search in prod."""
    query_lower = query.lower()
    scored = []
    for p in PRODUCT_CATALOG:
        score = 0
        for word in query_lower.split():
            if word in p["name"].lower():
                score += 2
            if word in p["category"].lower():
                score += 1
            if word in p["brand"].lower():
                score += 1
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:top_k]]


def _find_alternative(product: dict) -> Optional[dict]:
    """Find an alternative product in the same category."""
    category_products = _CATALOG_BY_CATEGORY.get(product["category"], [])
    for p in category_products:
        if p["product_id"] != product["product_id"]:
            return p
    return None


def _parse_items_with_gemini(query: str) -> list[str]:
    """
    Use Gemini to extract item names from natural language.
    Falls back to simple splitting if Gemini is unavailable.
    """
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = f"""You are a shopping list parser. Extract individual product items from this shopping request.
Return ONLY a JSON array of item name strings. No explanation.

User request: "{query}"

Example output: ["milk", "eggs", "bread", "coffee"]"""

        response = model.generate_content(prompt)
        text = response.text.strip()
        # Clean markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        items = json.loads(text)
        if isinstance(items, list):
            return items
    except Exception as e:
        logger.warning(f"Gemini parse failed, using fallback: {e}")

    # Fallback: simple keyword extraction
    separators = [",", " and ", " & "]
    items_text = query.lower()
    for sep in separators:
        items_text = items_text.replace(sep, "|")
    return [item.strip() for item in items_text.split("|") if len(item.strip()) > 1]


def _parse_image_with_gemini(image_bytes: bytes, query: str) -> tuple[str, list[SemanticItem]]:
    """
    Use Gemini Vision to analyze an image and extract needed items.
    """
    reasoning = "AI analyzed the image and identified items."
    items: list[SemanticItem] = []

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        import PIL.Image
        import io
        image = PIL.Image.open(io.BytesIO(image_bytes))

        prompt = f"""You are a smart shopping assistant analyzing an image.
The user says: "{query}"

Look at this image and identify items the user might need to buy.
Return a JSON object with:
- "reasoning": a brief explanation of what you see
- "items": an array of objects with "semantic_description" and "category"

Example:
{{"reasoning": "I see a fridge that's low on milk and fruits",
 "items": [{{"semantic_description": "1L Full Cream Milk", "category": "Dairy"}},
            {{"semantic_description": "Fresh bananas", "category": "Fruits"}}]}}"""

        response = model.generate_content([prompt, image])
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        parsed = json.loads(text)
        reasoning = parsed.get("reasoning", reasoning)
        for item_data in parsed.get("items", []):
            items.append(SemanticItem(
                semantic_description=item_data.get("semantic_description", ""),
                category=item_data.get("category", "General"),
            ))
    except Exception as e:
        logger.warning(f"Gemini Vision failed, using fallback: {e}")
        reasoning = "Could not analyze image, using text query instead."
        for keyword in _parse_items_with_gemini(query):
            items.append(SemanticItem(semantic_description=keyword, category="General"))

    return reasoning, items


class CartGenerationService:
    """Core service for AI-powered cart generation."""

    @staticmethod
    def generate_cart(user_id: str, query: str) -> CartResponse:
        """
        Generate a personalized cart from natural language intent.
        """
        logger.info(f"Generating cart for user={user_id}, query='{query[:50]}...'")

        # Parse query into item names
        item_names = _parse_items_with_gemini(query)
        logger.info(f"Parsed {len(item_names)} items: {item_names}")

        cart_items: list[CartItem] = []
        alternatives: dict[str, Optional[CartItem]] = {}

        for item_name in item_names:
            results = _search_products(item_name, top_k=1)
            if results:
                product = results[0]
                cart_item = CartItem(**product)
                cart_items.append(cart_item)

                # Find alternative
                alt = _find_alternative(product)
                alternatives[product["product_id"]] = CartItem(**alt) if alt else None
            else:
                logger.debug(f"No product found for: {item_name}")

        estimated_total = sum(item.price for item in cart_items)

        return CartResponse(
            cart_items=cart_items,
            alternatives=alternatives,
            estimated_total=estimated_total,
        )

    @staticmethod
    def generate_cart_multimodal(
        user_id: str, query: str, image_bytes: bytes
    ) -> MultimodalCartResponse:
        """
        Generate a personalized cart from an image + text query using Gemini Vision.
        """
        logger.info(f"Multimodal cart for user={user_id}, query='{query[:50]}...'")

        reasoning, semantic_items = _parse_image_with_gemini(image_bytes, query)

        cart_items: list[CartItem] = []
        alternatives: dict[str, Optional[CartItem]] = {}

        for sem_item in semantic_items:
            results = _search_products(sem_item.semantic_description, top_k=1)
            if results:
                product = results[0]
                cart_item = CartItem(**product)
                cart_items.append(cart_item)

                alt = _find_alternative(product)
                alternatives[product["product_id"]] = CartItem(**alt) if alt else None

        estimated_total = sum(item.price for item in cart_items)

        return MultimodalCartResponse(
            gemini_reasoning=reasoning,
            semantic_items=semantic_items,
            cart_items=cart_items,
            alternatives=alternatives,
            estimated_total=estimated_total,
        )

    @staticmethod
    def checkout(user_id: str, items: list[PurchaseItem]) -> CheckoutResponse:
        """
        Record purchase and update user preferences.
        In production, this would persist to a database and update recommendation models.
        """
        logger.info(
            f"Checkout for user={user_id}, "
            f"{len(items)} items, "
            f"total=₹{sum(i.price for i in items):.2f}"
        )
        # In production: save to DB, update user preferences, trigger analytics
        return CheckoutResponse(success=True)

"""
Pydantic schemas for the Smart Cart (instant-cart) feature.
Matches the OpenAPI specification exactly.
"""

from pydantic import BaseModel, Field
from typing import Optional


class CartItem(BaseModel):
    """A single item in the generated cart."""
    product_id: str
    name: str
    category: str
    brand: str
    price: float


class SemanticItem(BaseModel):
    """A single item identified by Gemini from image + text analysis."""
    semantic_description: str = Field(
        ..., description="Descriptive text of what is needed"
    )
    category: str = Field(
        default="General",
        description="Generic product category"
    )


# ─── Request Schemas ───────────────────────────────────

class InstantCartRequest(BaseModel):
    """Request body for /instant-cart endpoint."""
    user_id: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=1)


class PurchaseItem(BaseModel):
    """A single item in a purchase transaction."""
    product_id: str
    product_name: str = Field(..., max_length=256)
    category: str = Field(..., max_length=128)
    brand: str = Field(..., max_length=128)
    price: float = Field(..., gt=0, le=999999.99)


class CheckoutRequest(BaseModel):
    """Request body for /checkout-and-learn endpoint."""
    user_id: str = Field(..., min_length=1, max_length=128)
    final_purchased_items: list[PurchaseItem]


# ─── Response Schemas ──────────────────────────────────

class CartResponse(BaseModel):
    """Response body for /instant-cart endpoint."""
    cart_items: list[CartItem]
    alternatives: dict[str, Optional[CartItem]]
    estimated_total: float


class MultimodalCartResponse(BaseModel):
    """Response body for /instant-cart-multimodal endpoint."""
    gemini_reasoning: str
    semantic_items: list[SemanticItem]
    cart_items: list[CartItem]
    alternatives: dict[str, Optional[CartItem]]
    estimated_total: float


class CheckoutResponse(BaseModel):
    """Response body for /checkout-and-learn endpoint."""
    success: bool
    error: Optional[str] = None

"""
TreeNode model — stores the hierarchical semantic tree for each document.

Each document's chunks are organized into a binary tree where:
- Leaf nodes contain fine-grained key points from individual chunks
- Internal nodes contain progressively merged knowledge
- The root represents the entire document

Embeddings are stored both here (JSON for local cosine similarity during
tree traversal) and in PGVector collection "tree_nodes" (for efficient
similarity search during retrieval).
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TreeNode(Base):
    __tablename__ = "tree_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    node_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    parent_node_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    children_node_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_leaf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    key_points: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list] = mapped_column(JSON, nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

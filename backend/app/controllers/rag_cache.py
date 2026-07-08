"""
In-memory LRU cache for expensive RAG operations.

Keyed by a deterministic SHA-256 hash of the source text so identical
content is never re-processed (embeddings, key-point extractions, merges).
"""

from __future__ import annotations

import hashlib
from functools import lru_cache
from typing import Any


def text_hash(text: str) -> str:
    """Deterministic cache key from source text."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


class RAGCache:
    """Simple dict-based cache with size limit. Thread-safe enough for our use."""

    __slots__ = ("_store", "_max")

    def __init__(self, maxsize: int = 4096) -> None:
        self._store: dict[str, Any] = {}
        self._max = maxsize

    def get(self, key: str) -> Any | None:
        return self._store.get(key)

    def put(self, key: str, value: Any) -> None:
        if len(self._store) >= self._max:
            # evict oldest 25%
            keys = list(self._store.keys())
            for k in keys[: len(keys) // 4]:
                del self._store[k]
        self._store[key] = value

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)


# Module-level singletons
embedding_cache = RAGCache(maxsize=8192)
keypoint_cache = RAGCache(maxsize=4096)
merge_cache = RAGCache(maxsize=2048)

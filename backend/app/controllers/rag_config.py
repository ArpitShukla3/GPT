"""
Configuration for the Hierarchical RAG pipeline.

All tunable parameters are centralized here. Values can be overridden
via environment variables prefixed with RAG_ (e.g. RAG_CHUNK_SIZE=500).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env_int(key: str, default: int) -> int:
    return int(os.getenv(key, default))


def _env_float(key: str, default: float) -> float:
    return float(os.getenv(key, default))


@dataclass(frozen=True)
class RAGConfig:
    """Immutable configuration snapshot for the RAG pipeline."""

    # ── Document splitting ─────────────────────────────────────
    chunk_size: int = field(default_factory=lambda: _env_int("RAG_CHUNK_SIZE", 1000))
    chunk_overlap: int = field(default_factory=lambda: _env_int("RAG_CHUNK_OVERLAP", 200))

    # ── Clustering / tree ──────────────────────────────────────
    fan_out: int = field(default_factory=lambda: _env_int("RAG_FAN_OUT", 4))
    cluster_min_size: int = field(default_factory=lambda: _env_int("RAG_CLUSTER_MIN", 2))
    similarity_threshold: float = field(
        default_factory=lambda: _env_float("RAG_SIM_THRESHOLD", 0.3)
    )
    faiss_nprobe: int = field(default_factory=lambda: _env_int("RAG_FAISS_NPROBE", 10))

    # ── Batching / parallelism ─────────────────────────────────
    embedding_batch_size: int = field(
        default_factory=lambda: _env_int("RAG_EMB_BATCH", 64)
    )
    llm_batch_size: int = field(default_factory=lambda: _env_int("RAG_LLM_BATCH", 8))
    max_workers: int = field(default_factory=lambda: _env_int("RAG_MAX_WORKERS", 4))

    # ── Compression ────────────────────────────────────────────
    compress_max_chars: int = field(
        default_factory=lambda: _env_int("RAG_COMPRESS_MAX_CHARS", 8000)
    )
    compress_batch_size: int = field(
        default_factory=lambda: _env_int("RAG_COMPRESS_BATCH", 4)
    )

    # ── Retrieval ──────────────────────────────────────────────
    retrieval_top_k: int = field(default_factory=lambda: _env_int("RAG_TOP_K", 8))
    retrieval_questions_count: int = field(
        default_factory=lambda: _env_int("RAG_QUESTIONS", 4)
    )

    # ── Cache ──────────────────────────────────────────────────
    cache_enabled: bool = True

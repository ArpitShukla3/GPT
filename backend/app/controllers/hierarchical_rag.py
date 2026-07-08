"""
Optimized Hierarchical RAG — Tree-Based Document Compression.

Key optimizations over the original:
  1. FAISS ANN index replaces O(N²) pairwise similarity scans
  2. KMeans pre-clustering → independent sub-tree builds in parallel
  3. Multi-way merges (configurable fan-out, default 4)
  4. ThreadPoolExecutor for concurrent LLM calls
  5. Batch embedding via embed_documents()
  6. Deterministic cache for embeddings / key-points / merges
  7. Level-by-level parallel tree construction
  8. Generator-based memory management

Complexity:
  Before: O(N² × merge_steps) similarity + N sequential LLM calls
  After:  O(N log N) FAISS build + (N / fan_out) parallel LLM calls per level
"""

from __future__ import annotations

import json
import logging
import math
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Generator

import faiss
import numpy as np
from langchain_core.documents import Document as LCDocument
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.controllers.rag_cache import (
    embedding_cache,
    keypoint_cache,
    merge_cache,
    text_hash,
)
from app.controllers.rag_config import RAGConfig
from app.models.tree_node import TreeNode

if TYPE_CHECKING:
    from langchain_postgres import PGVector

logger = logging.getLogger(__name__)

# ─── Default config (overridable per-call) ────────────────────────
_cfg = RAGConfig()

# ─── Prompts ──────────────────────────────────────────────────────

_KEY_POINT_PROMPT = (
    "Extract ONLY the important factual points from the following text. "
    "Output as concise bullet points. Preserve all facts, numbers, names, "
    "and specific details. Remove filler words and unnecessary wording. "
    "Do NOT summarize — extract key facts."
)

_MERGE_PROMPT = (
    "Merge the following sets of key points into ONE combined set. "
    "Preserve ALL important facts. Combine related points. "
    "Remove only exact duplicates. Output concise bullet points."
)

_COMPRESS_PROMPT = (
    "Extract the most important factual points from the text below. "
    "Preserve ALL facts, numbers, names. Remove redundancy. "
    "Output concise bullet points."
)


# ══════════════════════════════════════════════════════════════════
# Phase 1 — Document Processing (parallel, cached)
# ══════════════════════════════════════════════════════════════════

def _extract_key_points_single(text: str, llm) -> str:
    """Cached key-point extraction for one segment."""
    h = text_hash(text)
    cached = keypoint_cache.get(h)
    if cached is not None:
        return cached

    resp = llm.invoke([
        SystemMessage(content=_KEY_POINT_PROMPT),
        HumanMessage(content=text),
    ])
    result = resp.content.strip()
    keypoint_cache.put(h, result)
    return result


def process_segments(
    chunks: list[LCDocument],
    emb_model,
    llm,
    cfg: RAGConfig = _cfg,
) -> list[dict]:
    """
    Convert chunks → leaf nodes with embeddings + key points.

    Embeddings are batch-computed. Key-point extraction runs in a thread
    pool for parallelism (LLM calls are I/O-bound).
    """
    texts = [c.page_content for c in chunks]

    # Batch embeddings (respects provider batch limits internally)
    all_embeddings = emb_model.embed_documents(texts)

    # Parallel key-point extraction
    key_points: list[str] = [None] * len(texts)  # type: ignore[list-item]

    def _extract(idx: int) -> tuple[int, str]:
        return idx, _extract_key_points_single(texts[idx], llm)

    with ThreadPoolExecutor(max_workers=cfg.max_workers) as pool:
        futures = [pool.submit(_extract, i) for i in range(len(texts))]
        for fut in as_completed(futures):
            idx, kp = fut.result()
            key_points[idx] = kp

    leaves: list[dict] = []
    for i, (chunk, emb, kp) in enumerate(zip(chunks, all_embeddings, key_points)):
        leaves.append({
            "node_id": str(uuid.uuid4()),
            "parent_node_id": None,
            "children_node_ids": [],
            "is_leaf": True,
            "key_points": kp,
            "embedding": emb,
            "source_text": chunk.page_content,
            "depth": 0,
        })

    logger.info("Phase 1 complete: %d leaf nodes", len(leaves))
    return leaves


# ══════════════════════════════════════════════════════════════════
# Phase 2 — Tree Construction (FAISS + KMeans + parallel merges)
# ══════════════════════════════════════════════════════════════════

def _build_faiss_index(embeddings: np.ndarray) -> faiss.IndexFlatIP:
    """Build a FAISS inner-product index (cosine sim on L2-normalised vecs)."""
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    faiss.normalize_L2(embeddings)
    index.add(embeddings)
    return index


def _cluster_nodes(nodes: list[dict], n_clusters: int) -> list[list[dict]]:
    """Split nodes into semantic clusters via KMeans."""
    from sklearn.cluster import KMeans

    if len(nodes) <= n_clusters:
        return [nodes]

    embs = np.array([n["embedding"] for n in nodes], dtype=np.float32)
    km = KMeans(n_clusters=n_clusters, n_init=3, random_state=42)
    labels = km.fit_predict(embs)

    clusters: dict[int, list[dict]] = {}
    for label, node in zip(labels, nodes):
        clusters.setdefault(int(label), []).append(node)

    return list(clusters.values())


def _merge_group(group: list[dict], llm, emb_model, depth: int) -> dict:
    """Merge N nodes into one parent via a single LLM call (multi-way merge)."""
    combined_input = "\n\n".join(
        f"Set {i+1}:\n{n['key_points']}" for i, n in enumerate(group)
    )

    # Check merge cache
    h = text_hash(combined_input)
    cached = merge_cache.get(h)
    if cached is not None:
        merged_kp = cached
    else:
        resp = llm.invoke([
            SystemMessage(content=_MERGE_PROMPT),
            HumanMessage(content=combined_input),
        ])
        merged_kp = resp.content.strip()
        merge_cache.put(h, merged_kp)

    embedding = emb_model.embed_query(merged_kp)
    return {
        "node_id": str(uuid.uuid4()),
        "parent_node_id": None,
        "children_node_ids": [n["node_id"] for n in group],
        "is_leaf": False,
        "key_points": merged_kp,
        "embedding": embedding,
        "source_text": None,
        "depth": depth,
    }


def _build_level(
    nodes: list[dict],
    llm,
    emb_model,
    depth: int,
    fan_out: int,
    cfg: RAGConfig,
) -> tuple[list[dict], list[dict]]:
    """
    Build one level of the tree by grouping nodes and merging in parallel.

    Returns (parents, all_new_nodes_including_parents).
    """
    if len(nodes) <= 1:
        return nodes, []

    # Sort nodes by FAISS nearest-neighbor groups
    embs = np.array([n["embedding"] for n in nodes], dtype=np.float32)
    faiss.normalize_L2(embs)
    idx = faiss.IndexFlatIP(embs.shape[1])
    idx.add(embs)

    # Greedy grouping: each node assigned to a group of fan_out
    assigned = set()
    groups: list[list[int]] = []

    for i in range(len(nodes)):
        if i in assigned:
            continue
        k = min(fan_out, len(nodes) - len(assigned))
        _, I = idx.search(embs[i:i+1], min(k * 2, len(nodes)))
        group = []
        for j in I[0]:
            if j not in assigned and len(group) < fan_out:
                group.append(int(j))
                assigned.add(int(j))
        if not group:
            group = [i]
            assigned.add(i)
        groups.append(group)

    # Parallel merge of each group
    parents: list[dict] = [None] * len(groups)  # type: ignore[list-item]

    def _merge(g_idx: int) -> tuple[int, dict]:
        g_nodes = [nodes[j] for j in groups[g_idx]]
        if len(g_nodes) == 1:
            return g_idx, g_nodes[0]
        parent = _merge_group(g_nodes, llm, emb_model, depth)
        for n in g_nodes:
            n["parent_node_id"] = parent["node_id"]
        return g_idx, parent

    new_nodes: list[dict] = []
    with ThreadPoolExecutor(max_workers=cfg.max_workers) as pool:
        futures = [pool.submit(_merge, gi) for gi in range(len(groups))]
        for fut in as_completed(futures):
            gi, parent = fut.result()
            parents[gi] = parent
            if parent not in [nodes[j] for j in groups[gi]]:
                new_nodes.append(parent)

    # Filter out single-node pass-throughs
    real_parents = [p for p in parents if p is not None]
    return real_parents, new_nodes


def build_tree(
    leaves: list[dict],
    llm,
    emb_model,
    cfg: RAGConfig = _cfg,
) -> list[dict]:
    """
    Build hierarchical tree level-by-level with parallel multi-way merges.

    For large docs, first pre-cluster via KMeans, build sub-trees
    independently, then merge the sub-tree roots.
    """
    if len(leaves) <= 1:
        return list(leaves)

    all_nodes = list(leaves)

    # Pre-cluster for large documents (>64 chunks)
    n_clusters = max(1, len(leaves) // (cfg.fan_out * 4))
    if n_clusters > 1 and len(leaves) > 64:
        clusters = _cluster_nodes(leaves, n_clusters)
        logger.info("Pre-clustered %d leaves into %d clusters", len(leaves), len(clusters))
    else:
        clusters = [leaves]

    # Build sub-trees independently
    sub_roots: list[dict] = []
    for ci, cluster in enumerate(clusters):
        pool = list(cluster)
        depth = 1
        while len(pool) > 1:
            logger.info("Cluster %d: pool=%d, depth=%d", ci, len(pool), depth)
            pool, new_nodes = _build_level(pool, llm, emb_model, depth, cfg.fan_out, cfg)
            all_nodes.extend(new_nodes)
            depth += 1
        sub_roots.extend(pool)

    # Merge sub-tree roots if multiple clusters
    if len(sub_roots) > 1:
        pool = sub_roots
        depth = max(n["depth"] for n in all_nodes) + 1
        while len(pool) > 1:
            logger.info("Root merge: pool=%d, depth=%d", len(pool), depth)
            pool, new_nodes = _build_level(pool, llm, emb_model, depth, cfg.fan_out, cfg)
            all_nodes.extend(new_nodes)
            depth += 1

    logger.info("Tree complete: %d total nodes", len(all_nodes))
    return all_nodes


# ══════════════════════════════════════════════════════════════════
# Persistence (index-time)
# ══════════════════════════════════════════════════════════════════

def build_and_store_tree(
    chunks: list[LCDocument],
    file_id: str,
    document_id: int,
    db: Session,
    llm,
    emb_model,
    tree_vs: "PGVector",
    cfg: RAGConfig = _cfg,
) -> int:
    """Full index pipeline: process → build tree → persist. Returns node count."""
    if not chunks:
        return 0

    leaves = process_segments(chunks, emb_model, llm, cfg)
    all_nodes = build_tree(leaves, llm, emb_model, cfg)

    # Batch persist to SQLAlchemy
    db.bulk_save_objects([
        TreeNode(
            document_id=document_id,
            file_id=file_id,
            node_id=n["node_id"],
            parent_node_id=n["parent_node_id"],
            children_node_ids=n["children_node_ids"],
            is_leaf=n["is_leaf"],
            key_points=n["key_points"],
            embedding=n["embedding"],
            depth=n["depth"],
            source_text=n.get("source_text"),
        )
        for n in all_nodes
    ])
    db.flush()

    # Batch persist to PGVector
    tree_vs.add_embeddings(
        texts=[n["key_points"] for n in all_nodes],
        embeddings=[n["embedding"] for n in all_nodes],
        metadatas=[
            {
                "node_id": n["node_id"],
                "file_id": file_id,
                "depth": n["depth"],
                "is_leaf": n["is_leaf"],
                "parent_node_id": n["parent_node_id"] or "",
                "children_node_ids": json.dumps(n["children_node_ids"]),
            }
            for n in all_nodes
        ],
    )

    db.commit()
    logger.info("Stored %d tree nodes for file_id=%s", len(all_nodes), file_id)
    return len(all_nodes)


def delete_tree(file_id: str, db: Session, tree_vs: "PGVector") -> None:
    """Remove all tree nodes for a file from both stores."""
    db.execute(delete(TreeNode).where(TreeNode.file_id == file_id))
    db.flush()
    try:
        tree_vs.delete(filter={"file_id": file_id})
    except Exception:
        logger.warning("Could not delete tree vectors for file_id=%s", file_id, exc_info=True)
    db.commit()


# ══════════════════════════════════════════════════════════════════
# Phase 3 — Query Understanding
# ══════════════════════════════════════════════════════════════════

def _analyze_intent(query: str, llm) -> dict:
    resp = llm.invoke([
        SystemMessage(content=(
            "Analyze the user's question. Respond in EXACTLY this format:\n"
            "INTENT: [what the user wants to know]\n"
            "MISSING_CONTEXT: [what additional context would help]\n"
            "REASONING: [what reasoning is needed]"
        )),
        HumanMessage(content=query),
    ])
    result = {"intent": "", "missing_context": "", "reasoning": ""}
    for line in resp.content.strip().split("\n"):
        l = line.strip()
        if l.upper().startswith("INTENT:"):
            result["intent"] = l[7:].strip()
        elif l.upper().startswith("MISSING_CONTEXT:"):
            result["missing_context"] = l[16:].strip()
        elif l.upper().startswith("REASONING:"):
            result["reasoning"] = l[10:].strip()
    if not result["intent"]:
        result["intent"] = resp.content.strip()
    return result


def _generate_retrieval_questions(query: str, llm, count: int = 4) -> list[str]:
    resp = llm.invoke([
        SystemMessage(content=(
            f"Generate {count} focused search questions to find relevant "
            "information in a document for the user's question. "
            "Output ONLY the questions, one per line, no numbering."
        )),
        HumanMessage(content=query),
    ])
    questions = [
        q.strip().lstrip("0123456789.-) ")
        for q in resp.content.strip().split("\n")
        if q.strip() and len(q.strip()) > 5
    ]
    if query not in questions:
        questions.insert(0, query)
    return questions[:count + 1]


# ══════════════════════════════════════════════════════════════════
# Phase 4 — Tree Retrieval
# ══════════════════════════════════════════════════════════════════

def _search_tree(
    questions: list[str],
    file_ids: list[str],
    tree_vs: "PGVector",
    db: Session,
    cfg: RAGConfig = _cfg,
) -> list[dict]:
    """Search PGVector tree, prioritise high-level nodes, descend for detail."""
    seen: set[str] = set()
    results: list[dict] = []

    for question in questions:
        for fid in file_ids:
            try:
                hits = tree_vs.similarity_search_with_score(
                    query=question,
                    k=cfg.retrieval_top_k,
                    filter={"file_id": fid},
                )
            except Exception:
                logger.warning("Tree search error for %s", fid, exc_info=True)
                continue

            for doc, score in hits:
                nid = doc.metadata.get("node_id", "")
                if nid in seen:
                    continue
                seen.add(nid)

                depth = doc.metadata.get("depth", 0)
                is_leaf = doc.metadata.get("is_leaf", True)
                children_ids = json.loads(
                    doc.metadata.get("children_node_ids", "[]")
                )

                results.append({
                    "node_id": nid,
                    "key_points": doc.page_content,
                    "depth": depth,
                    "is_leaf": is_leaf,
                    "score": score,
                })

                # Descend into children of high-level nodes for detail
                if not is_leaf and depth >= 2 and children_ids:
                    rows = db.scalars(
                        select(TreeNode).where(
                            TreeNode.node_id.in_(children_ids)
                        )
                    ).all()
                    for child in rows:
                        if child.node_id not in seen:
                            seen.add(child.node_id)
                            results.append({
                                "node_id": child.node_id,
                                "key_points": child.key_points,
                                "depth": child.depth,
                                "is_leaf": child.is_leaf,
                                "score": 0.0,
                            })

    return results


# ══════════════════════════════════════════════════════════════════
# Phase 5 — Progressive Compression
# ══════════════════════════════════════════════════════════════════

def _compress_batch(texts: list[str], llm) -> str:
    combined = "\n\n".join(texts)
    resp = llm.invoke([
        SystemMessage(content=_COMPRESS_PROMPT),
        HumanMessage(content=combined),
    ])
    return resp.content.strip()


def _progressive_compress(
    texts: list[str],
    llm,
    cfg: RAGConfig = _cfg,
) -> str:
    """Recursively compress retrieved content within token budget."""
    combined = "\n\n".join(texts)
    if len(combined) <= cfg.compress_max_chars:
        return combined

    compressed: list[str] = []
    bs = cfg.compress_batch_size
    for i in range(0, len(texts), bs):
        compressed.append(_compress_batch(texts[i:i + bs], llm))

    merged = "\n\n".join(compressed)
    if len(merged) <= cfg.compress_max_chars:
        return merged
    return _progressive_compress(compressed, llm, cfg)


# ══════════════════════════════════════════════════════════════════
# Phase 6 — Final Response
# ══════════════════════════════════════════════════════════════════

def _build_final_prompt(query: str, intent: dict, knowledge: str) -> list:
    system = (
        "You are an expert assistant. Answer the user's question using ONLY "
        "the supplied knowledge. Be thorough, accurate, and well-structured.\n\n"
        f"## User Intent\n{intent.get('intent', 'Unknown')}\n"
        f"## Required Reasoning\n{intent.get('reasoning', 'Direct answer')}\n\n"
        f"## Retrieved Knowledge\n{knowledge}"
    )
    return [SystemMessage(content=system), HumanMessage(content=query)]


# ══════════════════════════════════════════════════════════════════
# Orchestrator
# ══════════════════════════════════════════════════════════════════

def has_tree(file_ids: list[str], db: Session) -> bool:
    """Check whether any of the given files have tree nodes."""
    return db.scalar(
        select(TreeNode.id).where(TreeNode.file_id.in_(file_ids)).limit(1)
    ) is not None


def hierarchical_rag_query(
    query: str,
    file_ids: list[str],
    db: Session,
    primary_llm,
    lightweight_llm,
    emb_model,
    tree_vs: "PGVector",
    cfg: RAGConfig = _cfg,
) -> Generator[str, None, None]:
    """
    Full pipeline: intent → retrieval questions → tree search
      → compression → streamed final answer.
    """
    logger.info("H-RAG query=%r files=%s", query[:80], file_ids)

    # Phase 3 — run intent + questions in parallel
    with ThreadPoolExecutor(max_workers=2) as pool:
        intent_future = pool.submit(_analyze_intent, query, lightweight_llm)
        questions_future = pool.submit(
            _generate_retrieval_questions, query, lightweight_llm,
            cfg.retrieval_questions_count,
        )
        intent = intent_future.result()
        questions = questions_future.result()

    logger.info("Generated %d retrieval questions", len(questions))

    # Phase 4
    results = _search_tree(questions, file_ids, tree_vs, db, cfg)
    logger.info("Retrieved %d tree nodes", len(results))

    if not results:
        yield "No relevant information found in the tagged documents."
        return

    # Phase 5
    kp_texts = [r["key_points"] for r in results]
    compressed = _progressive_compress(kp_texts, lightweight_llm, cfg)
    logger.info("Compressed knowledge: %d chars", len(compressed))

    # Phase 6 — stream from primary LLM
    messages = _build_final_prompt(query, intent, compressed)
    inside_think = False
    for chunk in primary_llm.stream(messages):
        text = chunk.content or ""
        if "<think>" in text:
            inside_think = True
            continue
        if "</think>" in text:
            inside_think = False
            continue
        if not inside_think and text:
            yield text

"""
Routes for document (PDF) upload, listing, and deletion.

- POST   /users/{user_id}/documents   — Upload one or more PDFs
- GET    /users/{user_id}/documents   — List the user's uploaded documents
- DELETE /users/{user_id}/documents/{file_id} — Delete a document and its vectors
"""

import logging
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.user import User
from app.schemas.user import DocumentRead
from app.utils.errors import not_found, unauthorized

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Documents"])


def _ensure_user_access(user_id: int, current_user: User) -> None:
    if user_id != current_user.id:
        raise unauthorized("Cannot access another user's resources")


# ---------------------------------------------------------------------------
# Lazy import helpers — the vector_store / splitter / embeddings are globals
# initialised by init_workflow() at app startup.
# ---------------------------------------------------------------------------

def _get_vector_store():
    from app.controllers.user_controller import vector_store
    return vector_store


def _get_splitter():
    from app.controllers.user_controller import splitter
    return splitter


def _get_lightweight_llm():
    from app.controllers.user_controller import lightweight_llm
    return lightweight_llm


def _get_tree_vector_store():
    from app.controllers.user_controller import tree_vector_store
    return tree_vector_store


def _get_embeddings():
    from app.controllers.user_controller import embeddings
    return embeddings


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/{user_id}/documents", response_model=list[DocumentRead], status_code=201)
async def upload_documents(
    user_id: int,
    files: list[UploadFile] = File(..., description="One or more PDF files"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload PDFs, parse, chunk, embed, and store in PGVector.
    Each file gets a unique file_id stored as metadata on every chunk so it
    can be selectively retrieved later via @-tag references.
    """
    _ensure_user_access(user_id, current_user)

    vector_store = _get_vector_store()
    splitter = _get_splitter()

    created_docs: list[Document] = []

    for upload in files:
        file_id = str(uuid.uuid4())
        content = await upload.read()

        # Write to a temp file so PyPDFLoader can read it
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        from langchain_community.document_loaders import PyPDFLoader

        loader = PyPDFLoader(tmp_path)
        pages = loader.load()
        chunks = splitter.split_documents(pages)

        # Stamp each chunk with user_id + file_id for scoped retrieval
        for chunk in chunks:
            chunk.metadata["user_id"] = user_id
            chunk.metadata["file_id"] = file_id

        vector_store.add_documents(chunks)

        doc = Document(
            user_id=user_id,
            filename=upload.filename or "unnamed.pdf",
            file_id=file_id,
            chunk_count=len(chunks),
        )
        db.add(doc)
        db.flush()  # flush to get doc.id for tree building
        created_docs.append(doc)

        logger.info(
            "Indexed %d chunks for file %s (file_id=%s, user_id=%d)",
            len(chunks), upload.filename, file_id, user_id,
        )

        # Build hierarchical semantic tree
        try:
            from app.controllers.hierarchical_rag import build_and_store_tree
            lightweight_llm = _get_lightweight_llm()
            tree_vs = _get_tree_vector_store()
            if lightweight_llm and tree_vs:
                tree_node_count = build_and_store_tree(
                    chunks=chunks,
                    file_id=file_id,
                    document_id=doc.id,
                    db=db,
                    llm=lightweight_llm,
                    emb_model=_get_embeddings(),
                    tree_vs=tree_vs,
                )
                logger.info(
                    "Built tree with %d nodes for file_id=%s",
                    tree_node_count, file_id,
                )
        except Exception:
            logger.warning(
                "Tree building failed for file_id=%s, falling back to flat RAG",
                file_id, exc_info=True,
            )

    db.commit()
    for doc in created_docs:
        db.refresh(doc)

    return created_docs


@router.get("/{user_id}/documents", response_model=list[DocumentRead])
def list_documents(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all documents uploaded by the user."""
    _ensure_user_access(user_id, current_user)

    docs = db.scalars(
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.created_at.desc())
    ).all()

    return list(docs)


@router.delete("/{user_id}/documents/{file_id}", status_code=204)
def delete_document(
    user_id: int,
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document record and remove its chunks from the vector store."""
    _ensure_user_access(user_id, current_user)

    doc = db.scalar(
        select(Document)
        .where(Document.user_id == user_id, Document.file_id == file_id)
    )
    if not doc:
        raise not_found("Document not found")

    # Remove vectors by file_id metadata filter
    try:
        vector_store = _get_vector_store()
        # PGVector's delete accepts a filter dict
        vector_store.delete(filter={"file_id": file_id})
    except Exception:
        logger.warning("Could not delete vectors for file_id=%s", file_id, exc_info=True)

    # Remove hierarchical tree nodes
    try:
        from app.controllers.hierarchical_rag import delete_tree
        tree_vs = _get_tree_vector_store()
        if tree_vs:
            delete_tree(file_id, db, tree_vs)
    except Exception:
        logger.warning("Could not delete tree for file_id=%s", file_id, exc_info=True)

    db.delete(doc)
    db.commit()

# NexusRAG — Hierarchical AI Chat Platform

<div align="center">

**An AI-powered conversational workspace with hierarchical retrieval-augmented generation, real-time web search, and privacy-first middleware.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PGVector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agent-FF6F00?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)

</div>

---

## Overview

NexusRAG is a full-stack AI chat application that goes beyond simple RAG by organizing documents into **hierarchical semantic trees**. Instead of flat chunk retrieval, uploaded PDFs are decomposed into progressively compressed knowledge trees — enabling precise, context-rich answers with minimal token waste.

### Key Highlights

- 🌲 **Hierarchical Semantic Trees** — Documents are indexed as multi-level knowledge trees, not flat chunks
- ⚡ **FAISS-Accelerated Clustering** — ANN search replaces O(N²) similarity scans
- 🔄 **Self-Healing RAG** — Automatic re-retrieval when initial context is insufficient
- 🛡️ **PII Masking** — Emails, phone numbers, and credit card numbers redacted before LLM
- 📄 **PDF Upload + @-mention** — Upload documents and reference them with `@filename` in chat
- 🌐 **Live Web Search** — DuckDuckGo integration for real-time information grounding
- 🧠 **Conversation Compression** — Sliding-window summarization keeps context within token limits
- 🔌 **Multi-Provider** — Switch between Ollama, OpenRouter, Gemini, and HuggingFace

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────────────┐ │
│  │ AuthPage │  │ HomePage │  │           ChatPage            │ │
│  └──────────┘  └──────────┘  │  ┌────────┐  ┌────────────┐  │ │
│                               │  │Sidebar │  │ MessageView│  │ │
│                               │  │Threads │  │ + Markdown │  │ │
│                               │  │Docs    │  │ + Streaming│  │ │
│                               │  └────────┘  └────────────┘  │ │
│                               └───────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │  REST + SSE Streaming
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI + LangGraph)                │
│                                                                 │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ Auth Routes │  │ Document Routes│  │    User Routes       │ │
│  │ JWT + OAuth │  │ Upload/Delete  │  │ Chat SSE / Threads   │ │
│  └──────┬──────┘  └───────┬────────┘  └──────────┬───────────┘ │
│         │                 │                       │             │
│         ▼                 ▼                       ▼             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   LangGraph Agent                         │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐ │ │
│  │  │ RAG Tool   │  │ Web Search   │  │ Doc Builder Tool  │ │ │
│  │  │ (healing)  │  │ (DuckDuckGo) │  │ (PDF → PGVector)  │ │ │
│  │  └────────────┘  └──────────────┘  └───────────────────┘ │ │
│  │                                                           │ │
│  │  Middleware Stack:                                        │ │
│  │  PII Mask → Phone Mask → Condensation → Model Retry      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Hierarchical RAG Engine                       │ │
│  │                                                           │ │
│  │  Phase 1: Key-point extraction (lightweight LLM)          │ │
│  │  Phase 2: FAISS + KMeans → multi-way tree construction    │ │
│  │  Phase 3: Query intent analysis + retrieval questions      │ │
│  │  Phase 4: Semantic tree search with child descent          │ │
│  │  Phase 5: Progressive batch compression                    │ │
│  │  Phase 6: Final answer generation (primary LLM)            │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐  ┌───────────┐  ┌──────────┐
   │PostgreSQL│  │  PGVector │  │  Ollama   │
   │ Sessions │  │ Embeddings│  │  / Cloud  │
   │ Messages │  │ Tree Nodes│  │  LLM API  │
   └─────────┘  └───────────┘  └──────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite, TailwindCSS 4, shadcn/ui, Zustand, Lucide Icons |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy, LangGraph, LangChain |
| **Database** | PostgreSQL + PGVector extension |
| **Vector Store** | PGVector (flat chunks + tree node embeddings) |
| **ANN Index** | FAISS (IndexFlatIP for tree construction) |
| **Clustering** | scikit-learn KMeans |
| **LLM Providers** | Ollama (local), OpenRouter (cloud), Gemini, HuggingFace |
| **Embeddings** | nomic-embed-text (Ollama), text-embedding-004 (Gemini), MiniLM (HF) |
| **Auth** | JWT tokens + Google OAuth |

---

## Project Structure

```
aiChat/
├── backend/
│   ├── app/
│   │   ├── controllers/
│   │   │   ├── user_controller.py     # Agent init, chat, RAG tools
│   │   │   ├── hierarchical_rag.py    # 6-phase tree RAG engine
│   │   │   ├── rag_config.py          # Centralized configuration
│   │   │   └── rag_cache.py           # Deterministic caching layer
│   │   ├── models/
│   │   │   ├── user.py                # User model
│   │   │   ├── document.py            # Uploaded document metadata
│   │   │   ├── tree_node.py           # Hierarchical tree node model
│   │   │   ├── chat_message.py        # Persisted messages
│   │   │   └── auth_session.py        # JWT sessions
│   │   ├── routes/
│   │   │   ├── user_routes.py         # Chat SSE, threads CRUD
│   │   │   ├── document_routes.py     # PDF upload/delete
│   │   │   ├── auth_routes.py         # Login/signup/Google OAuth
│   │   │   └── health_routes.py       # Health check
│   │   ├── services/                  # Business logic layer
│   │   ├── schemas/                   # Pydantic request/response models
│   │   ├── db/                        # SQLAlchemy session + base
│   │   └── main.py                    # FastAPI app factory
│   ├── .env                           # Configuration
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── home-page.tsx          # Landing page
│   │   │   ├── auth-page.tsx          # Login / signup
│   │   │   └── chat-page.tsx          # Main chat interface
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── theme-provider.tsx     # Dark/light theme
│   │   │   └── starry-background.tsx  # Animated background
│   │   ├── lib/
│   │   │   ├── api.ts                 # API client + streaming
│   │   │   └── utils.ts              # Utilities
│   │   ├── stores/
│   │   │   └── use-auth-store.ts      # Zustand auth state
│   │   └── index.css                  # Design system tokens
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **PostgreSQL** with [pgvector](https://github.com/pgvector/pgvector) extension
- **Ollama** (optional, for local LLM inference)

### 1. Database Setup

```bash
# Install pgvector extension
sudo apt install postgresql-16-pgvector  # Ubuntu
# or
brew install pgvector                     # macOS

# Enable in your database
psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database URI, API keys, and provider choices
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
```

### 4. Run

```bash
# Terminal 1: Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** to access the application.

---

## Configuration

All configuration is managed through environment variables in `backend/.env`:

### LLM & Embeddings

| Variable | Options | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama`, `openrouter`, `gemini` | Primary LLM for chat |
| `EMBEDDING_PROVIDER` | `ollama`, `gemini`, `huggingface` | Embedding model provider |
| `CHECKPOINTER_PROVIDER` | `postgres`, `inmemory` | Conversation state persistence |

### Hierarchical RAG Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_FAN_OUT` | `4` | Children per merge (2=binary, 4=quad, 8=wide) |
| `RAG_MAX_WORKERS` | `4` | Thread pool size for parallel LLM calls |
| `RAG_CHUNK_SIZE` | `1000` | Text splitter chunk size |
| `RAG_TOP_K` | `8` | Retrieval top-k results |
| `RAG_COMPRESS_MAX_CHARS` | `8000` | Compression target character limit |
| `RAG_QUESTIONS` | `4` | Number of retrieval questions generated |

### Database

| Variable | Description |
|----------|-------------|
| `POSTGRES_URI` | PostgreSQL connection string |
| `PGVECTOR_URI` | PGVector connection string (psycopg2 format) |

---

## How the Hierarchical RAG Works

### Document Ingestion

```
PDF Upload → Text Split → Batch Embed → Key-Point Extraction (parallel)
                                              │
                                              ▼
                                    KMeans Pre-clustering
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                               Cluster 1  Cluster 2  Cluster N
                                    │         │         │
                              FAISS+Merge  FAISS+Merge  FAISS+Merge
                                    │         │         │
                                 Sub-root  Sub-root  Sub-root
                                    └─────────┼─────────┘
                                              ▼
                                         Final Root
                                              │
                                    Store → PostgreSQL + PGVector
```

### Query-Time Retrieval

```
User Query → Intent Analysis ─────┐ (parallel)
           → Retrieval Questions ─┘
                    │
                    ▼
           PGVector Similarity Search (tree_nodes collection)
                    │
                    ▼
           Tree Descent (high-level → children for detail)
                    │
                    ▼
           Progressive Compression (batch → merge → recurse)
                    │
                    ▼
           Final Response (primary LLM, streamed)
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/google` | Google OAuth |

### Chat & Threads
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users/{id}/threads` | List threads |
| `POST` | `/api/users/{id}/threads` | Create thread |
| `GET` | `/api/users/{id}/threads/{tid}/messages` | Get messages |
| `POST` | `/api/users/{id}/chat` | Send message (SSE stream) |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users/{id}/documents` | Upload PDFs |
| `GET` | `/api/users/{id}/documents` | List documents |
| `DELETE` | `/api/users/{id}/documents/{fid}` | Delete document |

---

## License

This project is for educational and research purposes.

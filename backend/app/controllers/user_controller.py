from langchain_ollama import OllamaEmbeddings
from langchain_ollama import ChatOllama
from dataclasses import dataclass
from typing import Annotated, TypedDict
from langgraph.checkpoint.postgres import PostgresSaver
from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph, add_messages
from langchain_core.messages import HumanMessage, SystemMessage, AIMessageChunk
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.prebuilt import ToolNode, tools_condition
from langchain.tools import tool
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import requests
import tempfile
from langchain_postgres import PGVector
import os
from langchain_core.prompts import PromptTemplate
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents.middleware import TodoListMiddleware,PIIMiddleware,AgentMiddleware,ModelRetryMiddleware,ToolRetryMiddleware
import re
from deepagents.middleware import FilesystemMiddleware, MemoryMiddleware, SkillsMiddleware,SummarizationMiddleware
from deepagents.backends import StateBackend
from deepagents import create_deep_agent
from langchain_huggingface import HuggingFaceEmbeddings
load_dotenv()
backend = StateBackend()
local_llm = None
cloud_llm = None
llm = None
model = None
huggingFace_llm = None
workflow = None
splitter = None
embeddings= None
vector_store= None
retriever= None
checkpointer_cm = None
checkpointer = None
workflow = None
search_tool = None
agent =  None
final_llm = None
lightweight_llm = None
tree_vector_store = None

class MessagesState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    summaryTillNow: str

@tool
def build_doc(source: str):
    """
    Load a PDF from a local path or URL, generate embeddings,
    and add the contents to the vector database.
    """

    if source.startswith(("http://", "https://")):
        response = requests.get(source, timeout=30)
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(
            suffix=".pdf",
            delete=False
        ) as temp_file:
            temp_file.write(response.content)
            pdf_path = temp_file.name

    else:
        pdf_path = source

    loader = PyPDFLoader(pdf_path)

    docs = loader.load()

    chunks = splitter.split_documents(docs)

    vector_store.add_documents(chunks)

    return f"Indexed {len(chunks)} chunks"

@tool
def rag_search(query: str, k : int = 5) -> str:
    """
    Search the knowledge base and return the most relevant document chunks
    related to the user's query.
    """

    docs = vector_store.similarity_search(
        query=query,
        k=k
    )

    if not docs:
        return "No relevant information found in the knowledge base."

    return "\n\n".join(
        doc.page_content
        for doc in docs
    )

def grade_retrieval(query: str, docs: str) -> bool:

    prompt = f"""
    User Question:
    {query}

    Retrieved Context:
    {docs}

    Can the question be answered accurately using ONLY
    the retrieved context?

    Respond with exactly:
    YES
    or
    NO
    """

    response = llm.invoke(prompt)

    return "YES" in response.content.upper()

@tool
def self_healing_rag(query: str) -> str:
    """
    Search the knowledge base and return the most relevant document chunks
    related to the user's query.
    """
    max_k = 25
    k = 5

    while k <= max_k:

        docs = rag_search.invoke({
            "query": query,
            "k": k
        })

        if grade_retrieval(query, docs):
            return docs

        k += 5

    return docs

def summarise(arr, summary):
    newSummary = ""
    
    for i, msg in enumerate(arr):
        newSummary += f"{type(msg).__name__}: {msg.content}\n"
     
    prompt = PromptTemplate(
        template=""" 
        Existing summary:
        {summary}

        New messages:
        {array}

        Produce an updated summary.
        """,
        input_variables=["summary", "array"]
    )

    chain = prompt | llm

    response=  chain.invoke({
        "summary": summary,
        "array": newSummary
    })
    return response.content

def short(state : MessagesState):
    n = len(state["messages"])
    if n>8:
        summary  = summarise(state["messages"][:-3], state.get("summaryTillNow", ""))
        # keep last three messages
        return {
            "messages" : state["messages"][-3:],
            "summaryTillNow" : summary
        }

def chat_node(state: MessagesState):
    updates = short(state)

    if updates:
        state = {**state, **updates}

    summary = state.get("summaryTillNow", "")
    messages = state.get("messages", [])

    llm_input = []

    if summary:
        llm_input.append(SystemMessage(content=f"Refer to this summary for chat history:\n{summary} and respond to users query"))

    llm_input.extend(messages)
    print(summary, " ", len(messages))
    res = llm.invoke(llm_input)

    response = {"messages": [res]}

    if updates:
        response.update(updates)

    return response

class PhoneMaskMiddleware(AgentMiddleware):

    PHONE_REGEX = re.compile(
        r'(\+?\d{1,3}[-.\s]?)?\d{10}'
    )

    def before_model(self, state, runtime):

        messages = state["messages"]

        updated_messages = []

        for msg in messages:

            if isinstance(msg, HumanMessage):

                masked_content = self.PHONE_REGEX.sub(
                    "[PHONE_NUMBER]",
                    msg.content
                )

                updated_messages.append(
                    HumanMessage(content=masked_content)
                )

            else:
                updated_messages.append(msg)

        return {
            "messages": updated_messages
        }

class ConversationCondensationMiddleware(AgentMiddleware):
    """
    Before each model call, retains only the last 2 conversational
    (Human / AI / Tool) messages and replaces all older ones with a
    rolling summary injected as a SystemMessage at the top of the
    context window. This keeps the token budget bounded while preserving
    full conversational context through the summary.
    """

    SUMMARY_TAG = "[PRIOR CONVERSATION SUMMARY]"

    def __init__(self, model) -> None:
        super().__init__()
        self._model = model

    @property
    def name(self) -> str:
        return "ConversationCondensationMiddleware"

    def before_model(self, state, runtime):
        messages = state.get("messages", [])

        # Separate system messages (including any existing summary) from
        # conversational messages (Human, AI, Tool)
        system_msgs = []
        prior_summary = ""
        conv_msgs = []

        for m in messages:
            if isinstance(m, SystemMessage):
                content = m.content if isinstance(m.content, str) else ""
                if content.startswith(self.SUMMARY_TAG):
                    # Recover the running summary text
                    prior_summary = content[len(self.SUMMARY_TAG):].strip()
                else:
                    system_msgs.append(m)
            else:
                conv_msgs.append(m)

        # Nothing to condense yet
        if len(conv_msgs) <= 2:
            return None

        to_summarize = conv_msgs[:-2]
        to_keep      = conv_msgs[-2:]

        # Build plaintext of messages that will be folded into the summary
        history_text = "\n".join(
            f"{type(m).__name__.replace('Message', '')}: "
            f"{m.content if isinstance(m.content, str) else str(m.content)}"
            for m in to_summarize
        )

        prompt = PromptTemplate(
            template=(
                "Existing summary:\n{summary}\n\n"
                "New messages to incorporate:\n{history}\n\n"
                "Produce a concise, updated summary that captures all key topics, "
                "decisions, facts, and context. Be brief."
            ),
            input_variables=["summary", "history"],
        )
        response = (prompt | self._model).invoke(
            {"summary": prior_summary, "history": history_text}
        )
        new_summary = response.content.strip()

        # Reassemble: original system prompts + summary + last 2 conv msgs
        summary_msg = SystemMessage(
            content=f"{self.SUMMARY_TAG}\n{new_summary}"
        )
        return {"messages": system_msgs + [summary_msg] + to_keep}


def init_workflow() -> None:
    global workflow
    global checkpointer_cm
    global checkpointer
    global local_llm
    global cloud_llm 
    global model
    global huggingFace_llm
    global splitter
    global embeddings
    global vector_store
    global retriever
    global llm 
    global search_tool
    global agent
    global lightweight_llm
    global tree_vector_store
    search_tool = DuckDuckGoSearchRun()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    embeddingProvider = os.getenv("EMBEDDING_PROVIDER")
    if(embeddingProvider == "huggingface"):
        embeddings = HuggingFaceEmbeddings( model_name="sentence-transformers/all-MiniLM-L6-v2")
    elif(embeddingProvider == "ollama"):
        embeddings = OllamaEmbeddings(model="nomic-embed-text")
    elif(embeddingProvider == "gemini"):
        embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")
    else:
        embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")
    vector_store = PGVector(
        embeddings=embeddings,
        collection_name="documents",
        connection=os.environ["PGVECTOR_URI"],
    )
    tree_vector_store = PGVector(
        embeddings=embeddings,
        collection_name="tree_nodes",
        connection=os.environ["PGVECTOR_URI"],
    )
    retriever = vector_store.as_retriever(
        search_kwargs={"k": 5}
    )

    checkpointer_provider = os.getenv("CHECKPOINTER_PROVIDER")
    if(checkpointer_provider == "postgres"):
        checkpointer_cm = PostgresSaver.from_conn_string(os.environ["POSTGRES_URI"])
        checkpointer = checkpointer_cm.__enter__()
        checkpointer.setup()
    elif(checkpointer_provider == "inmemory"):
        checkpointer = InMemorySaver()
    else:
        checkpointer = InMemorySaver()

    llmProvider = os.getenv("LLM_PROVIDER")
    if(llmProvider == "ollama"):
        llm = ChatOllama(model = "granite4.1:3b",  num_predict=200    )
    # elif(llmProvider == "gemini"):
        # llm = ChatGemini(model = "gemini-1.5-flash",  num_predict=200)
    # elif(llmProvider == "huggingface"):
    #     llm = HuggingFacePipeline(
    #         pipeline=pipeline,
    #         model_kwargs={"temperature": 0.7, "max_new_tokens": 500}
    #     )
    elif(llmProvider == "openrouter"):
        llm = ChatOpenRouter(
            model="qwen/qwen3-coder:free",
            temperature=0.7,
        )
    else:
        llm = ChatOllama(model = "granite4.1:3b",  num_predict=200    )

    # Lightweight LLM for tree building & compression
    if llmProvider == "ollama":
        lightweight_llm = ChatOllama(model="gemma3:1b")
    elif llmProvider == "openrouter":
        lightweight_llm = ChatOpenRouter(
            model="google/gemma-3-1b-it:free",
            temperature=0.3,
        )
    else:
        lightweight_llm = ChatOllama(model="gemma3:1b")
    
    agent = create_deep_agent(
        model=llm,
        tools= [build_doc, self_healing_rag, search_tool],
        checkpointer= checkpointer,
        state_schema= Context,
        middleware=[
            PIIMiddleware("credit_card"),
            PIIMiddleware("email"),
            PIIMiddleware("ip"),
            PIIMiddleware("mac_address"),
            # FilesystemMiddleware(backend = backend),
            PhoneMaskMiddleware(),
            ConversationCondensationMiddleware(llm),
            # MemoryMiddleware(backend=backend, sources=["/home/arpit/Desktop/projects/aiChat/backend/app/controllers/AGENTS.md"]),
            ModelRetryMiddleware(max_retries=3),
            ToolRetryMiddleware(max_retries=2),
        ],
        )
    print("Graph compiled successfully")

def close_workflow() -> None:
    global workflow
    global checkpointer_cm
    global checkpointer

    if checkpointer_cm is not None:
        checkpointer_cm.__exit__(None, None, None)
        checkpointer_cm = None
        checkpointer = None

    workflow = None
 

def chat(query: str, thread_id : str):
    if workflow is None:
        raise RuntimeError("Workflow has not been initialized")

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    inputs = {
        "messages": [
            HumanMessage(content=query)
        ],
        "summaryTillNow": "",
    }


    for chunk, metadata in workflow.stream(
        inputs,
        config=config,
        stream_mode="messages"
    ):
        if getattr(chunk, "content", None):
            yield chunk.content


def file_scoped_rag(query: str, file_ids: list[str], k: int = 10) -> str:
    """
    Retrieve document chunks that belong to specific files only.
    Uses PGVector metadata filtering on file_id.
    """
    if not file_ids:
        return ""

    all_chunks: list[str] = []
    for file_id in file_ids:
        docs = vector_store.similarity_search(
            query=query,
            k=k,
            filter={"file_id": file_id},
        )
        all_chunks.extend(doc.page_content for doc in docs)

    if not all_chunks:
        return "No relevant information found in the tagged documents."

    return "\n\n".join(all_chunks)


@dataclass
class Context:
    userData : str
def chatv2(query: str, thread_id: str, file_ids: list[str] | None = None, db = None):
    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    # If the user tagged specific files, check for hierarchical tree first
    if file_ids and db is not None:
        from app.controllers.hierarchical_rag import has_tree, hierarchical_rag_query
        if has_tree(file_ids, db):
            yield from hierarchical_rag_query(
                query=query,
                file_ids=file_ids,
                db=db,
                primary_llm=llm,
                lightweight_llm=lightweight_llm,
                emb_model=embeddings,
                tree_vs=tree_vector_store,
            )
            return

    # Fallback: flat PGVector retrieval for legacy files
    messages: list = []
    if file_ids:
        context = file_scoped_rag(query, file_ids)
        if context:
            messages.append(SystemMessage(
                content=(
                    "The user has referenced specific uploaded documents. "
                    "Use the following document context to answer their question:\n\n"
                    f"{context}"
                )
            ))

    messages.append(HumanMessage(content=query))

    inputs = {
        "messages": messages
    }
    if(os.getenv("APP_ENV") == "development"):
        for message in messages:
            print(message)
    generator = agent.stream(inputs, config=config, stream_mode="messages")

    inside_think = False

    for chunk, metadata in generator:
        if not isinstance(chunk, AIMessageChunk):
            continue

        if chunk.tool_calls:
            yield "Calling tools"
            continue

        text = chunk.content or ""

        if "<think>" in text:
            inside_think = True
            continue

        if "</think>" in text:
            inside_think = False
            continue

        if not inside_think:
            yield text
        else:
            print(text,end="",flush=True)


def generate_thread_title(first_message: str) -> str:
    if llm is None:
        return _fallback_thread_title(first_message)

    prompt = [
        SystemMessage(
            content=(
                "Write a short chat thread title from the user's first message. "
                "Return only the title, 2 to 6 words, with no quotes, markdown, or extra text."
            )
        ),
        HumanMessage(content=first_message),
    ]

    try:
        response = llm.invoke(prompt)
        content = getattr(response, "content", "").strip()
    except Exception:
        content = ""

    title = _clean_thread_title(content)
    return title or _fallback_thread_title(first_message)


def _clean_thread_title(value: str) -> str:
    cleaned = value.strip().strip('"').strip("'")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" .,:;-")
    words = cleaned.split()
    if len(words) > 6:
        cleaned = " ".join(words[:6])
    return cleaned


def _fallback_thread_title(first_message: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", first_message)
    if not words:
        return "New chat"

    return " ".join(words[:6]).title()

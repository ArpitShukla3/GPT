from dataclasses import dataclass
from traceback import StackSummary
from typing import Annotated, TypedDict
from langgraph.checkpoint.postgres import PostgresSaver
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_openrouter import ChatOpenRouter
from langgraph.graph import END, START, StateGraph, add_messages
from langchain_core.messages import HumanMessage, SystemMessage, AIMessageChunk
from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.prebuilt import ToolNode, tools_condition
from langchain.tools import tool
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
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

def init_workflow() -> None:
    global workflow
    global checkpointer_cm
    global checkpointer
    global local_llm
    global cloud_llm 
    global model
    global huggingFace_llm
    global workflow
    global splitter
    global embeddings
    global vector_store
    global retriever
    global llm 
    global check
    global search_tool
    global agent
    search_tool = DuckDuckGoSearchRun()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    embeddings = HuggingFaceEmbeddings( model_name="sentence-transformers/all-MiniLM-L6-v2")
    vector_store = PGVector(
        embeddings=embeddings,
        collection_name="documents",
        connection=os.environ["PGVECTOR_URI"],
    )
    retriever = vector_store.as_retriever(
        search_kwargs={"k": 5}
    )

    checkpointer_cm = PostgresSaver.from_conn_string(os.environ["POSTGRES_URI"])
    checkpointer = checkpointer_cm.__enter__()
    checkpointer.setup()
    # checkpointer = InMemorySaver()

    # local_llm = ChatOllama(model = "granite4.1:3b",  num_predict=200)
    cloud_llm = ChatOpenRouter(
            model="nvidia/nemotron-3-ultra-550b-a55b:free",
            temperature=0.7,
        )
    
    # model = HuggingFaceEndpoint(
    #     repo_id="Qwen/Qwen3.6-27B",
    #     task="text-generation",
    #     max_new_tokens=512,
    # )
    # huggingFace_llm = ChatHuggingFace(llm=model, verbose=True)
    llm = cloud_llm

    # tools = [search_tool,build_doc,rag_search]
    # graph = StateGraph(MessagesState)

    # graph.add_node("chat_node", chat_node)
    # graph.add_node("tools", ToolNode(tools))

    # graph.add_edge(START, "chat_node")
    # graph.add_conditional_edges("chat_node", tools_condition)
    # graph.add_edge("tools", "chat_node")

    # workflow = graph.compile(checkpointer=checkpointer)
    agent = create_agent(
        model="openrouter:nvidia/nemotron-3-ultra-550b-a55b:free",
        tools= [build_doc, self_healing_rag, search_tool],
        checkpointer= checkpointer,
        context_schema= Context,
        middleware=[
            TodoListMiddleware(),
            PIIMiddleware("credit_card"),
            PIIMiddleware("email"),
            PIIMiddleware("ip"),
            PIIMiddleware("mac_address"),
            # FilesystemMiddleware(backend = backend),
            PhoneMaskMiddleware(),
            # SummarizationMiddleware(model=llm, backend=backend),
            # MemoryMiddleware(backend=backend, sources=["/home/arpit/Desktop/projects/aiChat/backend/app/controllers/AGENTS.md"]),
            ModelRetryMiddleware(max_retries=3),
            ToolRetryMiddleware(max_retries=2),
            ]
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


from langchain.agents import create_agent
@dataclass
class Context:
    userData : str
def chatv2(query: str, thread_id : str):
    print("hvbdfh")
    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    inputs = {
        "messages": [
            SystemMessage(content = "Limit the output to approax 100 words only"),
            SystemMessage(content = f"If needed,prepare a short title query, then use search tool to find the related information,this tool is used only for exploration for enrenrichment of the response, prefer to use it most of times"),
            SystemMessage(content = f"use rag tool in cases when user wants to know about the uploaded information or the conversation is sticked to the same topic, if user switches topic and its contents have never been uploaded by th euser then avoid using this tool aggressively, but if user asks then use the tool aggressively"),
            HumanMessage(content=query)
        ]
    }

    generator = agent.stream(inputs, config=config, stream_mode="messages")

    for chunk,metadata in generator:
        if isinstance(chunk, AIMessageChunk):
            if chunk.tool_calls:
                yield "Calling tools"

            elif chunk.content:
                yield chunk.content


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

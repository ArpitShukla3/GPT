from dotenv import load_dotenv
from fastapi import APIRouter, Depends
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import ThreadCreateRead, ThreadListRead, ThreadMessageRead
from app.services.user_service import UserService
from app.utils.errors import not_found, unauthorized

try:
    from app.controllers.user_controller import chatv2, generate_thread_title
except ModuleNotFoundError as exc:  # pragma: no cover - dependency guard
    _chat_import_error = exc

    def chatv2(*args, **kwargs):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat workflow is unavailable in this environment",
        )

    def generate_thread_title(*args, **kwargs):
        return "New chat"
else:
    _chat_import_error = None

load_dotenv()
router = APIRouter(prefix="/users", tags=["Users"])


class ChatRequest(BaseModel):
    query: str
    user_id: int
    thread_id: str
    file_ids: list[str] = []


def ensure_user_access(user_id: int, current_user: User) -> None:
    if user_id != current_user.id:
        raise unauthorized("Cannot access another user's resources")


@router.get("/{user_id}/threads", response_model=ThreadListRead)
def list_threads(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_user_access(user_id, current_user)
    service = UserService(db)
    thread_ids = service.list_thread_ids(user_id)
    threads = service.list_thread_summaries(user_id)
    return ThreadListRead(thread_ids=thread_ids, threads=threads)


@router.post("/{user_id}/threads", response_model=ThreadCreateRead, status_code=201)
def create_thread(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_user_access(user_id, current_user)
    service = UserService(db)
    thread_id = service.create_thread_id(user_id)
    thread_ids = service.list_thread_ids(user_id)
    threads = service.list_thread_summaries(user_id)
    return ThreadCreateRead(thread_id=thread_id, thread_ids=thread_ids, threads=threads)


@router.get("/{user_id}/threads/{thread_id}/messages", response_model=list[ThreadMessageRead])
def list_thread_messages(
    user_id: int,
    thread_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_user_access(user_id, current_user)
    service = UserService(db)
    user = service.get_user(user_id)
    if thread_id not in (user.thread_ids or []):
        raise not_found("Thread not found")
    return service.list_thread_messages(user_id, thread_id)


@router.post("/chat")
def reply(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query_str = payload.query
    user_id = payload.user_id
    thread_id = payload.thread_id
    ensure_user_access(user_id, current_user)
    service = UserService(db)
    user = service.get_user(user_id)
    if thread_id not in (user.thread_ids or []):
        raise not_found("Thread not found")

    service.create_thread_message(user_id, thread_id, "user", query_str)
    if service.get_thread_title(user_id, thread_id) is None:
        service.set_thread_title(user_id, thread_id, generate_thread_title(query_str))

    def stream_and_persist():
        assistant_chunks: list[str] = []
        completed = False

        try:
            for chunk in chatv2(query_str, thread_id, file_ids=payload.file_ids, db=db):
                assistant_chunks.append(chunk)
                yield chunk
            completed = True
        finally:
            if completed and assistant_chunks:
                service.create_thread_message(
                    user_id,
                    thread_id,
                    "assistant",
                    "".join(assistant_chunks),
                )

    return StreamingResponse(stream_and_persist(), media_type="text/plain")

# @router.post("/speak")
# def reply(payload: ChatRequest, db: Session = Depends(get_db)):
#     query_str = payload.query
#     user_id = payload.user_id
#     thread_id = payload.thread_id
#     service = UserService(db)
#     user = service.get_user(user_id)
#     if thread_id not in (user.thread_ids or []):
#         raise not_found("Thread not found")

#     service.create_thread_message(user_id, thread_id, "user", query_str)

#     def stream_and_persist():
#         assistant_chunks: list[str] = []
#         completed = False

#         try:
#             for chunk in speak(query_str, thread_id):
#                 assistant_chunks.append(chunk)
#                 yield chunk
#             completed = True
#         finally:
#             if completed and assistant_chunks:
#                 service.create_thread_message(
#                     user_id,
#                     thread_id,
#                     "assistant",
#                     "".join(assistant_chunks),
#                 )

#     return StreamingResponse(stream_and_persist(), media_type="text/plain")

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat_message import ChatMessage
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.utils.errors import conflict, not_found


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def list_users(self) -> list[User]:
        return list(self.db.scalars(select(User).order_by(User.id)).all())

    def get_user(self, user_id: int) -> User:
        user = self.db.get(User, user_id)
        if not user:
            raise not_found("User not found")
        return user

    def create_user(self, payload: UserCreate) -> User:
        existing_user = self.db.scalar(select(User).where(User.email == payload.email))
        if existing_user:
            raise conflict("Email already exists")

        user = User(name=payload.name, email=payload.email, thread_ids=[], thread_titles={})
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user(self, user_id: int, payload: UserUpdate) -> User:
        user = self.get_user(user_id)

        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(user, field, value)

        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_user(self, user_id: int) -> None:
        user = self.get_user(user_id)
        self.db.delete(user)
        self.db.commit()

    def list_thread_ids(self, user_id: int) -> list[str]:
        user = self.get_user(user_id)
        return list(user.thread_ids or [])

    def list_thread_summaries(self, user_id: int) -> list[dict[str, str | None]]:
        user = self.get_user(user_id)
        thread_ids = list(user.thread_ids or [])
        thread_titles = dict(user.thread_titles or {})

        return [
            {
                "thread_id": thread_id,
                "title": thread_titles.get(thread_id),
            }
            for thread_id in thread_ids
        ]

    def create_thread_id(self, user_id: int) -> str:
        user = self.get_user(user_id)

        from uuid import uuid4

        thread_id = str(uuid4())
        thread_ids = list(user.thread_ids or [])
        thread_ids.append(thread_id)
        user.thread_ids = thread_ids
        self.db.commit()
        self.db.refresh(user)
        return thread_id

    def get_thread_title(self, user_id: int, thread_id: str) -> str | None:
        user = self.get_user(user_id)
        return (user.thread_titles or {}).get(thread_id)

    def set_thread_title(self, user_id: int, thread_id: str, title: str) -> None:
        cleaned_title = title.strip()
        if not cleaned_title:
            return

        user = self.get_user(user_id)
        thread_titles = dict(user.thread_titles or {})
        thread_titles[thread_id] = cleaned_title
        user.thread_titles = thread_titles
        self.db.commit()
        self.db.refresh(user)

    def list_thread_messages(self, user_id: int, thread_id: str) -> list[ChatMessage]:
        return list(
            self.db.scalars(
                select(ChatMessage)
                .where(ChatMessage.user_id == user_id)
                .where(ChatMessage.thread_id == thread_id)
                .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            ).all()
        )

    def create_thread_message(
        self,
        user_id: int,
        thread_id: str,
        role: str,
        content: str,
    ) -> ChatMessage:
        message = ChatMessage(user_id=user_id, thread_id=thread_id, role=role, content=content)
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message

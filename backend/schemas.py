from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List, TypedDict, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class UserRole(Enum):
    user = "user"
    admin = "admin"


class UploadStatus(Enum):
    queued = "queued"
    processing = "processing"
    failed = "failed"
    done = "done"


class UserSignUp(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserSignIn(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    username: str
    email: EmailStr


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    role: UserRole
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentCreate(BaseModel):
    filename: str


class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    saved_filename: str
    upload_status: UploadStatus
    created_at: datetime
    storage_path: str

    model_config = ConfigDict(from_attributes=True)


class RFPSource(BaseModel):
    sections: List[str]
    chunk_index: int
    similarity: float
    document_id: uuid.UUID
    filename: str


class ChatRequest(BaseModel):
    session_id: uuid.UUID
    user_query: str
    document_ids: List[uuid.UUID] = []


class ChatResponse(BaseModel):
    answer: str
    sources: List[RFPSource] = []

    model_config = ConfigDict(from_attributes=True)


class FailedFiles(BaseModel):
    reason: str
    filename: str


class UploadResponse(BaseModel):
    queued: List[DocumentResponse]
    already_exists: List[DocumentResponse]
    failed: List[FailedFiles]


class SessionTitle(BaseModel):
    title: str


class Sessions(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str | None
    pinned: bool = False
    created_at: datetime


class MemoryDecision(BaseModel):
    mem_decision: bool


class AgentState(TypedDict):
    user_id: str
    session_id: str
    user_query: str
    document_ids: List[uuid.UUID]
    memories: List[str] | None
    relevant_context: List[Dict[str, Any]] | None
    chat_history: List[Dict[str, Any]] | None
    llm_answer: ChatResponse | None
    title: str | None
    message_saved: bool = False
    mem_decision: bool = False
    memory_updated: bool = False


class ChatMessages(BaseModel):
    session_id: uuid.UUID
    messages: List
    limit: int
    offset: int

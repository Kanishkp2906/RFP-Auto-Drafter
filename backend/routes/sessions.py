from fastapi import APIRouter, HTTPException, Depends, status, Query
from dependencies import get_admin_db, get_datetime
from auth import get_current_user
from services.cache import get_cache, set_cache, delete_cache
from schemas import Sessions, ChatMessages
from supabase import Client
from typing import List
from uuid import UUID

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


@router.post("/new-chat", response_model=Sessions, status_code=status.HTTP_201_CREATED)
async def new_session(
    current_user=Depends(get_current_user), db: Client = Depends(get_admin_db)
):

    session = {
        "user_id": current_user.id,
        "title": "New chat",
        "created_at": get_datetime(),
    }

    try:
        db_response = db.table("sessions").insert(session).execute()

        user_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        if not user_sessions.data:
            raise HTTPException(
                status_code=500, detail="Failed to create a new session."
            )

        await delete_cache(f"sessions:{current_user.id}")
        await set_cache(f"sessions:{current_user.id}", user_sessions.data[0], 600)

        if db_response.data:
            return db_response.data[0]

    except HTTPException:
        raise

    except Exception as error:
        print("[+] Error in creating a new session.")
        raise HTTPException(status_code=503, detail=str(error))


@router.get("/my-sessions", response_model=List[Sessions])
async def user_sessions(
    current_user=Depends(get_current_user), db: Client = Depends(get_admin_db)
):
    try:
        user_sessions = await get_cache(f"sessions:{current_user.id}")

        if user_sessions is not None:
            return user_sessions

        db_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        if not db_sessions.data:
            raise HTTPException(status_code=500, detail="Failed to get user sessions.")

        await set_cache(f"sessions:{current_user.id}", db_sessions.data, 600)

        return db_sessions.data

    except HTTPException:
        raise

    except Exception as error:
        print(f"Error in retrieving user sessions: {str(error)}")


@router.get("/{session_id}/messages", response_model=ChatMessages)
async def get_session_messages(
    session_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user=Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    try:
        db_session = (
            db.table("sessions")
            .select("id")
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not db_session.data:
            raise HTTPException(status_code=404, detail="Session not found.")

        version_key = f"messages:version:{session_id}"
        version = await get_cache(version_key) or 0

        cache_key = (
            f"messages:{session_id}:v{version}{offset}:{limit}:{current_user.id}"
        )

        cached_messages = await get_cache(cache_key)

        if cached_messages is not None:
            return cached_messages

        db_messages = (
            db.table("messages")
            .select("id, role, content, created_at")
            .eq("session_id", session_id)
            .order("created_at")
            .range(offset, offset + limit - 1)
            .execute()
        )

        chat_messages = {
            "session_id": session_id,
            "messages": db_messages.data,
            "limit": limit,
            "offset": offset,
        }
        await set_cache(cache_key, chat_messages, 600)

        return chat_messages

    except HTTPException:
        raise

    except Exception as error:
        print(f"[+] Error in session messages route: {str(error)}")
        raise HTTPException(status_code=502, detail=str(error))

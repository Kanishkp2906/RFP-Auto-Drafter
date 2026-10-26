from fastapi import APIRouter, HTTPException, Depends, status, Query
from dependencies import get_admin_db, get_datetime
from auth import get_current_user
from services.cache import get_cache, set_cache, delete_cache
from schemas import Sessions, ChatMessages
from supabase import Client
from typing import List
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sessions", tags=["Sessions"])


@router.post("/new-chat", response_model=Sessions, status_code=status.HTTP_201_CREATED)
async def new_session(
    current_user=Depends(get_current_user), db: Client = Depends(get_admin_db)
):

    session = {
        "user_id": current_user.id,
        "title": None,
        "pinned": False,
        "created_at": get_datetime(),
    }

    try:
        db_response = db.table("sessions").insert(session).execute()

        user_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        await delete_cache(f"sessions:{current_user.id}")
        await set_cache(f"sessions:{current_user.id}", user_sessions.data, 600)

        return db_response.data[0]

    except Exception as error:
        logger.exception(f"[-] Error in creating a new session: {str(error)}")
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

        await set_cache(f"sessions:{current_user.id}", db_sessions.data, 600)

        return db_sessions.data

    except Exception as error:
        logger.exception(f"[-] Error in user sessions route: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


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
        logger.exception(f"[-] Error in session messages route: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.delete("/{session_id}/delete", response_model=Sessions)
async def delete_session(
    session_id: UUID,
    current_user=Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):

    try:
        db_session = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        if not db_session.data:
            raise HTTPException(status_code=404, detail="Session not found")

        deleted_session = (
            db.table("sessions")
            .delete()
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not deleted_session.data:
            raise HTTPException(status_code=404, detail="Failed to find the session.")

        user_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        await delete_cache(f"sessions:{current_user.id}")
        if user_sessions.data:
            await set_cache(f"sessions:{current_user.id}", user_sessions.data, 600)

        return deleted_session.data[0]

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(f"[-] Error in delete session route: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.patch("/{session_id}/rename", response_model=Sessions)
async def rename_session(
    session_id: UUID,
    new_title: str,
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

        updated_session = (
            db.table("sessions")
            .update({"title": new_title})
            .eq("id", session_id)
            .execute()
        )

        user_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        await delete_cache(f"sessions:{current_user.id}")
        if user_sessions.data:
            await set_cache(f"sessions:{current_user.id}", user_sessions.data, 600)

        return updated_session.data[0]

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(f"[-] Error in renaming the session: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))


@router.patch("/{session_id}/pin", response_model=Sessions)
async def pin_session(
    session_id: UUID,
    pinned: bool = Query(default=True),
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

        updated_session = (
            db.table("sessions")
            .update({"pinned": pinned})
            .eq("id", session_id)
            .execute()
        )

        user_sessions = (
            db.table("sessions").select("*").eq("user_id", current_user.id).execute()
        )

        await delete_cache(f"sessions:{current_user.id}")
        if user_sessions.data:
            await set_cache(f"sessions:{current_user.id}", user_sessions.data, 600)

        return updated_session.data[0]

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(f"[-] Error in pinning the session: {str(error)}")
        raise HTTPException(status_code=503, detail=str(error))

import uuid
import json
from typing import List
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from auth import get_current_user, get_user_db
from schemas import ChatRequest
from supabase import Client

router = APIRouter(prefix="/api/rag", tags=["RAG"])


async def stream_agent(request: Request, agent_state: dict):

    graph = request.app.state.graph

    config = {"configurable": {"thread_id": str(agent_state["session_id"])}}

    async for event in graph.astream_events(agent_state, config=config, version="v2"):
        if event["event"] == "on_chain_end" and event["name"] == "generate_answer":
            output = event["data"].get("output", {})

            if output and output.get("llm_answer"):
                answer = output["llm_answer"]

                yield f"data: {json.dumps(answer.model_dump_json())}\n\n"


@router.post("/chat")
async def generate_stream(
    request: Request,
    chat_request: ChatRequest,
    document_ids: List[uuid.UUID],
    current_user=Depends(get_current_user),
    db: Client = Depends(get_user_db),
):
    try:
        db_session = (
            db.table("sessions").select("*").eq("id", chat_request.session_id).execute()
        )
        if db_session.data:
            session_title = db_session.data[0]["title"]

        agent_state = {
            "user_id": current_user.id,
            "session_id": chat_request.session_id,
            "user_query": chat_request.user_query,
            "document_ids": document_ids,
            "title": session_title,
            "memories": None,
            "chat_history": None,
            "relevant_context": None,
            "llm_answer": None,
            "message_saved": False,
            "mem_decision": False,
            "memory_updated": False,
        }

        return StreamingResponse(
            stream_agent(request, agent_state), media_type="text/event-stream"
        )

    except Exception as error:
        print("[+] Error in chat route")
        raise HTTPException(status_code=503, detail=str(error))

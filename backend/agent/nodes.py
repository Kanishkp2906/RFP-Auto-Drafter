from config import groq_api_key, groq_model, groq_model2
from schemas import AgentState, ChatResponse, SessionTitle, MemoryDecision
from fastapi import HTTPException
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dependencies import async_admin_db, get_datetime, async_redis
from agent.memory_client import mem_client
from langchain_groq import ChatGroq
from services.cache import delete_cache
from agent.prompts import (
    GENERATE_TITLE_PROMPT,
    GENERATE_ANSWER_PROMPT,
    MEMORY_DECISION_PROMPT,
)
import logging

logger = logging.getLogger(__name__)


async def retrieve_memories_node(state: AgentState) -> AgentState:

    if state["memories"] is not None:
        return state

    try:
        memory_search = await mem_client.search(
            state["user_query"],
            filters={
                "user_id": str(state["user_id"]),
                "session_id": str(state["session_id"]),
            },
        )

        memories = [
            f"{mem.get('memory', '')}" for mem in memory_search.get("results", {})
        ]

        return {"memories": memories}

    except Exception as error:
        logger.exception(f"[-] Error in retrieve memories node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def retrieve_chat_history_node(state: AgentState) -> AgentState:

    if state["chat_history"] is not None:
        return state

    admin_db = await async_admin_db()

    try:
        chat_history = await (
            admin_db.table("messages")
            .select("*")
            .eq("session_id", state["session_id"])
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        return {"chat_history": chat_history.data}

    except Exception as error:
        logger.exception(f"[-] Error in retrieving chat history from db: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def retrieve_context_node(
    state: AgentState, top_k: int = 15, similarity_threshold: float = 0.65
) -> AgentState:

    if state["relevant_context"] is not None:
        return state

    admin_db = await async_admin_db()

    try:
        document_ids = state["document_ids"]

        embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

        query_vector = await embeddings.aembed_query(state["user_query"])

        db_response = await admin_db.rpc(
            "match_rfp_docs",
            {
                "query_embedding": query_vector,
                "match_count": top_k,
                "p_document_ids": [str(document_id) for document_id in document_ids],
            },
        ).execute()

        context_list = db_response.data

        relevant_context = [
            context
            for context in (context_list or [])
            if context["similarity"] >= similarity_threshold
        ]

        return {"relevant_context": relevant_context if relevant_context else []}

    except Exception as error:
        logger.exception(f"[-] Error in retrieving context: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def generate_title_node(state: AgentState) -> AgentState:

    if state["title"] is not None:
        return state

    admin_db = await async_admin_db()
    user_query = state["user_query"]

    try:
        model = ChatGroq(
            model=groq_model,
            temperature=0.2,
            api_key=groq_api_key,
        )

        structured_model = model.with_structured_output(SessionTitle)

        generated_title = await structured_model.ainvoke(
            [("system", GENERATE_TITLE_PROMPT), ("human", user_query)]
        )

        state["title"] = generated_title.title

        await (
            admin_db.table("sessions")
            .update({"title": str(state["title"])})
            .eq("id", state["session_id"])
            .execute()
        )

        await delete_cache(f"sessions:{state['user_id']}")

        return state

    except Exception as error:
        logger.exception(f"[+] Error in generate title node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def generate_answer_node(state: AgentState) -> AgentState:

    if state["llm_answer"] is not None:
        return state

    context = (
        state["relevant_context"]
        or "No relevant rfp context was retrieved fro this context."
    )
    user_query = state["user_query"]
    memories = state["memories"]

    augmented_input = f"""RFP CONTEXT: {context} USER QUESTION: {user_query} MEMORIES OF CURRENT SESSION: {memories}"""

    try:
        model = ChatGroq(
            model=groq_model,
            temperature=0.3,
            api_key=groq_api_key,
        )

        structured_model = model.with_structured_output(ChatResponse)

        llm_answer = await structured_model.ainvoke(
            [("system", GENERATE_ANSWER_PROMPT), ("human", augmented_input)]
        )

        state["llm_answer"] = llm_answer

        return state

    except Exception as error:
        logger.exception(f"[+] Error in generate answer node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def save_messages_node(state: AgentState) -> AgentState:

    if state["llm_answer"] is None:
        return state

    admin_db = await async_admin_db()

    try:
        user_message = {
            "session_id": str(state["session_id"]),
            "role": "user",
            "content": state["user_query"],
            "created_at": get_datetime(),
        }

        assistant_message = {
            "session_id": str(state["session_id"]),
            "role": "assistant",
            "content": state["llm_answer"].model_dump_json(),
            "created_at": get_datetime(),
        }

        db_response = await (
            admin_db.table("messages")
            .insert([user_message, assistant_message])
            .execute()
        )

        version_key = f"messages:version:{state['session_id']}"

        await async_redis.incr(version_key)

        if db_response.data:
            state["message_saved"] = True
            return state

    except Exception as error:
        logger.exception(f"[+] Error in save messages node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def memory_decision_node(state: AgentState) -> AgentState:

    try:
        model = ChatGroq(model=groq_model2, temperature=0.3, api_key=groq_api_key)

        structured_model = model.with_structured_output(MemoryDecision)

        user_query = str(state["user_query"])

        answer = await structured_model.ainvoke(
            [("system", MEMORY_DECISION_PROMPT), ("human", user_query)]
        )

        print("Mem Decision:", answer.mem_decision)
        state["mem_decision"] = answer.mem_decision

        return state

    except Exception as error:
        logger.exception(f"[+] Error in memory decision node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))


async def update_memory_node(state: AgentState) -> AgentState:

    if state["mem_decision"] is False:
        return state

    elif state["llm_answer"] is None:
        return state

    try:
        messages = [
            {"role": "user", "content": state["user_query"]},
        ]

        user_query = str(state["user_query"])
        messages = [{"role": "user", "content": user_query}]

        await mem_client.add(
            messages,
            user_id=str(state["user_id"]),
            metadata={"session_id": str(state["session_id"])},
        )

        state["memory_updated"] = True
        return state

    except Exception as error:
        logger.exception(f"[+] Error in update memory node: {str(error)}")
        raise HTTPException(status_code=500, detail=str(error))

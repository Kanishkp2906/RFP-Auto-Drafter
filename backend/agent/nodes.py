from config import groq_api_key
from schemas import AgentState, ChatResponse, SessionTitle, MemoryDecision
from fastapi import HTTPException
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from supabase import Client
from dependencies import get_admin_db, get_datetime, redis_client
from agent.memory_client import mem_client
from langchain_groq import ChatGroq
from agent.prompts import (
    GENERATE_TITLE_PROMPT,
    GENERATE_ANSWER_PROMPT,
    MEMORY_DECISION_PROMPT,
)

admin_db: Client = get_admin_db()


class NoRelevantContextError(Exception):
    """Error class for raising an exception if no relevant context is found with passing similarity threshold."""

    pass


def retrieve_memories_node(state: AgentState) -> AgentState:

    if state["memories"] is not None:
        return state

    try:
        memory_search = mem_client.search(
            state["user_query"],
            filters={
                "user_id": str(state["user_id"]),
                "session_id": str(state["session_id"]),
            },
        )

        memories = [f"{mem.get('memory')}" for mem in memory_search.get("results")]

        if memories is not None:
            state["memories"] = memories

        return state

    except Exception as error:
        print("[+] Error in retrieve memories node.")
        raise HTTPException(status_code=503, detail=str(error))


def retrieve_chat_history_node(state: AgentState) -> AgentState:

    if state["chat_history"] is not None:
        return state

    try:
        chat_history = (
            admin_db.table("messages")
            .select("*")
            .eq("session_id", state["session_id"])
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        if chat_history.data:
            state["chat_history"] = chat_history.data

            return state

    except Exception as error:
        print("[+] Error in retrieving chat history from db.")
        raise HTTPException(state_code=503, detail=str(error))


def retrieve_context_node(
    state: AgentState, top_k: int = 15, similarity_threshold: float = 0.65
) -> AgentState:

    if state["relevant_context"] is not None:
        return state

    try:
        document_ids = state["document_ids"]

        embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")

        query_vector = embeddings.embed_query(state["user_query"])

        db_response = admin_db.rpc(
            "match_rfp_docs",
            {
                "query_embedding": query_vector,
                "match_count": top_k,
                "p_document_ids": [str(document_id) for document_id in document_ids],
            },
        ).execute()
        print(f"Document_ids: {document_ids}")
        print(f"response: {bool(db_response.data)}")

    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error))

    if not db_response.data:
        raise HTTPException(
            status_code=404, detail="No relevant information found in the RFP."
        )

    context_list = db_response.data

    relevant_context = [
        context
        for context in context_list
        if context["similarity"] >= similarity_threshold
    ]

    try:
        if not relevant_context:
            raise NoRelevantContextError(
                "No sufficient relevant information was found in the RFP."
            )

        state["relevant_context"] = relevant_context

        return state

    except NoRelevantContextError as error:
        print("[+] Error in retrieve context node.")
        raise HTTPException(status_code=404, detai=str(error))


def generate_title_node(state: AgentState) -> AgentState:

    if state["title"] != "New chat":
        return state

    user_query = state["user_query"]

    try:
        model = ChatGroq(
            model="openai/gpt-oss-120b",
            temperature=0.2,
            api_key=groq_api_key,
        )

        structured_model = model.with_structured_output(SessionTitle)

        generated_title = structured_model.invoke(
            [("system", GENERATE_TITLE_PROMPT), ("human", user_query)]
        )
        print(generated_title)
        state["title"] = generated_title.title

        admin_db.table("sessions").update({"title": str(state["title"])}).eq(
            "id", state["session_id"]
        ).execute()

        return state

    except Exception as error:
        print("[+] Error in generate title node.")
        raise HTTPException(status_code=503, detail=str(error))


def generate_answer_node(state: AgentState) -> AgentState:

    if state["llm_answer"] is not None:
        return state

    context = state["relevant_context"]
    user_query = state["user_query"]
    memories = state["memories"]

    augmented_input = f"""RFP CONTEXT: {context} USER QUESTION: {user_query} MEMORIES OF CURRENT SESSION: {memories}"""

    try:
        model = ChatGroq(
            model="openai/gpt-oss-120b",
            temperature=0.3,
            api_key=groq_api_key,
        )

        structured_model = model.with_structured_output(ChatResponse)

        llm_answer = structured_model.invoke(
            [("system", GENERATE_ANSWER_PROMPT), ("human", augmented_input)]
        )

        state["llm_answer"] = llm_answer

        return state

    except Exception as error:
        print("[+] Error in generate answer node.")
        raise HTTPException(status_code=503, detail=str(error))


async def save_messages_node(state: AgentState) -> AgentState:

    if state["llm_answer"] is None:
        return state

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

        db_response = (
            admin_db.table("messages")
            .insert([user_message, assistant_message])
            .execute()
        )

        version_key = f"messages:version:{state['session_id']}"

        await redis_client.incr(version_key)

        if db_response.data:
            state["message_saved"] = True
            return state

    except Exception as error:
        print("[+] Error in save messages node.")
        raise HTTPException(status_code=503, detail=str(error))


def memory_decision_node(state: AgentState) -> AgentState:

    model = ChatGroq(model="openai/gpt-oss-20b", temperature=0.3, api_key=groq_api_key)

    structured_model = model.with_structured_output(MemoryDecision)

    answer = structured_model.invoke(
        [("system", MEMORY_DECISION_PROMPT), ("human", state["user_query"])]
    )

    print("Mem Decision:", answer.mem_decision)
    state["mem_decision"] = answer.mem_decision

    return state


def update_memory_node(state: AgentState) -> AgentState:

    if state["mem_decision"] is False:
        return state

    elif state["llm_answer"] is None:
        return state

    try:
        messages = [
            {"role": "user", "content": state["user_query"]},
        ]

        mem_client.add(
            messages,
            user_id=str(state["user_id"]),
            metadata={"session_id": str(state["session_id"])},
        )

        state["memory_updated"] = True
        return state

    except Exception as error:
        print("[+] Error in update memory node.")
        raise HTTPException(status_code=503, detail=str(error))

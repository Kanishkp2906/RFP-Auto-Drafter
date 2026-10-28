from langgraph.graph import StateGraph, START, END
from schemas import AgentState
from agent.nodes import (
    retrieve_memories_node,
    retrieve_chat_history_node,
    retrieve_context_node,
    generate_title_node,
    generate_answer_node,
    save_messages_node,
    memory_decision_node,
    update_memory_node,
)


def title_check(state: AgentState) -> str:
    if state["title"] is None:
        return "generate_title"
    return "save_messages"


builder = StateGraph(AgentState)

builder.add_node("retrieve_memories", retrieve_memories_node)
builder.add_node("retrieve_chat_history", retrieve_chat_history_node)
builder.add_node("retrieve_context", retrieve_context_node)
builder.add_node("generate_title", generate_title_node)
builder.add_node("generate_answer", generate_answer_node)
builder.add_node("save_messages", save_messages_node)
builder.add_node("memory_decision", memory_decision_node)
builder.add_node("update_memory", update_memory_node)

builder.add_edge(START, "retrieve_memories")
builder.add_edge(START, "retrieve_chat_history")
builder.add_edge(START, "retrieve_context")
builder.add_edge(
    ["retrieve_memories", "retrieve_chat_history", "retrieve_context"],
    "generate_answer",
)
builder.add_conditional_edges("generate_answer", title_check)
builder.add_edge("generate_title", "save_messages")
builder.add_edge("save_messages", END)
# builder.add_edge("memory_decision", "update_memory")
# builder.add_edge("update_memory", END)

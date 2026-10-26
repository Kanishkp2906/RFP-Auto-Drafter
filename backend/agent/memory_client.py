from mem0 import AsyncMemory
from config import (
    qdrant_url,
    qdrant_api_key,
    gemini_api_key,
    groq_api_key,
    embedding_model,
    groq_model2,
)

config = {
    "version": "v1.1",
    "embedder": {
        "provider": "gemini",
        "config": {"api_key": gemini_api_key, "model": embedding_model},
    },
    "llm": {
        "provider": "groq",
        "config": {"api_key": groq_api_key, "model": groq_model2},
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "url": qdrant_url,
            "api_key": qdrant_api_key,
            "embedding_model_dims": 768,
            "collection_name": "rfp_collection",
        },
    },
}

mem_client = AsyncMemory.from_config(config)

from mem0 import Memory
from config import qdrant_url, qdrant_api_key
from config import gemini_api_key, groq_api_key

config = {
    "version": "v1.1",
    "embedder": {
        "provider": "gemini",
        "config": {"api_key": gemini_api_key, "model": "gemini-embedding-001"},
    },
    "llm": {
        "provider": "groq",
        "config": {"api_key": groq_api_key, "model": "openai/gpt-oss-20b"},
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

mem_client = Memory.from_config(config)

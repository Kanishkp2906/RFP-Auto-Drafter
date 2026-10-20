import json
import logging
from dependencies import redis_client

logger = logging.getLogger(__name__)


async def get_cache(key: str):
    try:
        value = await redis_client.get(key)

        if value is None:
            return None

        return json.loads(value)

    except Exception:
        logger.exception("Redis cache read failed.")
        return None


async def set_cache(key: str, value, ttl: int = 300) -> None:
    try:
        await redis_client.set(
            key,
            json.dumps(value, default=str),
            ex=ttl,
        )
    except Exception:
        logger.exception("Redis cache write failed.")


async def delete_cache(key: str) -> None:
    try:
        await redis_client.delete(key)

    except Exception:
        logger.exception("Redis cache invalidation failed.")

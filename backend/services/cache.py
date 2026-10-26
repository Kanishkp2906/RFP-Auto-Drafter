import json
import logging
from dependencies import async_redis

logger = logging.getLogger(__name__)


async def get_cache(key: str):
    try:
        value = await async_redis.get(key)

        if value is None:
            return None

        return json.loads(value)

    except Exception:
        logger.exception("Redis cache read failed.")
        return None


async def set_cache(key: str, value, ttl: int = 300) -> None:
    try:
        await async_redis.set(
            key,
            json.dumps(value, default=str),
            ex=ttl,
        )
    except Exception:
        logger.exception("Redis cache write failed.")


async def delete_cache(key: str) -> None:
    try:
        await async_redis.delete(key)

    except Exception:
        logger.exception("Redis cache invalidation failed.")

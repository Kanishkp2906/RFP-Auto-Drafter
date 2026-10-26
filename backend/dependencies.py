from supabase import Client, create_client, acreate_client, AsyncClient
from config import supabase_url, supabase_key, supabase_anon_key
import datetime
import logging
import pytz
import redis
import redis.asyncio as async_redis
from fastapi import HTTPException

logger = logging.getLogger(__name__)


try:
    sync_redis = redis.Redis(host="localhost", port="6379", decode_responses=True)
    async_redis = async_redis.Redis(
        host="localhost", port="6379", decode_responses=True
    )

except Exception as error:
    logger.info("[-] Error in creating redis clients.")
    raise HTTPException(status_code=500, detail=str(error))


def get_datetime():
    dt = datetime.datetime.now(tz=pytz.UTC)
    return dt.astimezone(pytz.timezone("Asia/Kolkata")).isoformat()


try:

    def get_supabase() -> Client:
        supabase: Client = create_client(supabase_url, supabase_anon_key)
        return supabase

    def get_admin_db() -> Client:
        admin_db: Client = create_client(supabase_url, supabase_key)
        return admin_db

except Exception as error:
    logger.info("[-] Error in creating supabase clients.")
    raise HTTPException(status_code=500, detail=str(error))


_admin_client: AsyncClient | None = None


async def async_admin_db() -> AsyncClient:
    global _admin_client
    try:
        if _admin_client is None:
            _admin_client = await acreate_client(supabase_url, supabase_key)
        return _admin_client
    except Exception as error:
        logger.info("[-] Error in creating async_admin_db client.")
        raise HTTPException(status_code=500, detail=str(error))

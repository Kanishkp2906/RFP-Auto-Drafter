from supabase import Client, create_client
from config import supabase_url, supabase_key, supabase_anon_key
import datetime
import pytz
import redis.asyncio as redis

redis_client = redis.Redis(host="localhost", port="6379", decode_responses=True)


def get_datetime():
    dt = datetime.datetime.now(tz=pytz.UTC)
    return dt.astimezone(pytz.timezone("Asia/Kolkata")).isoformat()


def get_supabase() -> Client:
    supabase: Client = create_client(supabase_url, supabase_anon_key)
    return supabase


def get_admin_db() -> Client:
    admin_db: Client = create_client(supabase_url, supabase_key)
    return admin_db

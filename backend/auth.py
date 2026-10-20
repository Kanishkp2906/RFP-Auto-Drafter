from fastapi import HTTPException, Header, Request
from postgrest import SyncPostgrestClient
from storage3 import SyncStorageClient
from config import supabase_url, supabase_anon_key


async def get_current_user(request: Request):
    return request.state.user


async def get_user_db(authorization: str = Header(...)):
    if not authorization.startswith("Bearer"):
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    token = authorization.removeprefix("Bearer ").strip()

    return SyncPostgrestClient(
        f"{supabase_url}/rest/v1",
        headers={"apikey": supabase_anon_key, "authorization": f"Bearer {token}"},
    )


async def get_user_storage(authorization: str = Header(...)):
    if not authorization.startswith("Bearer"):
        raise HTTPException(status_detail=401, detail="Invalid authorization header.")

    access_token = authorization.removeprefix("Bearer ").strip()

    headers = {"apiKey": supabase_anon_key, "Authorization": f"Bearer {access_token}"}

    return SyncStorageClient(f"{supabase_url}/storage/v1/", headers)

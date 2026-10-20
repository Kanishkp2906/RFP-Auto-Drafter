import httpx
from fastapi import APIRouter, Header, HTTPException
from config import supabase_url, supabase_anon_key

router = APIRouter(prefix="/api/test", tags=["RLS Test"])


@router.get("/auth")
async def test_rls(authorization: str = Header(...)):

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    headers = {"apikey": supabase_anon_key, "Authorization": authorization}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{supabase_url}/rest/v1/rpc/test_sessions_insert", headers=headers, json={}
        )

    return {"status_code": response.status_code, "response": response.json()}

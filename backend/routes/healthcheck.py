from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from dependencies import get_supabase
from dependencies import redis_client

router = APIRouter(prefix="/api/healthcheck", tags=["Health"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    return JSONResponse(status_code=200, content={"status": "success"})


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check(db=Depends(get_supabase)):
    try:
        db.table("users").select("id").limit(1).execute()

        redis_client.ping()

        return JSONResponse(
            status_code=200,
            content={"detail": "Supabase and Redis are sucessfully running."},
        )

    except Exception:
        raise HTTPException(status_code=503, detail="Service is not ready!")

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from dependencies import get_supabase
from dependencies import async_redis
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/healthcheck", tags=["Health"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    return JSONResponse(status_code=200, content={"status": "success"})


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check(db=Depends(get_supabase)):
    try:
        db.table("users").select("id").limit(1).execute()

        await async_redis.ping()

        return JSONResponse(
            status_code=200,
            content={"detail": "Supabase and Redis are sucessfully running."},
        )

    except Exception as error:
        logger.exception(f"[-] Error in ready route: {str(error)}")
        raise HTTPException(status_code=503, detail="Service is not ready!")

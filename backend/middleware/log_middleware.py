from time import perf_counter
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


logger = logging.getLogger("FastAPI")


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = perf_counter()

        try:
            response = await call_next(request)

        except Exception:
            user = getattr(request.state, "user", None)
            duration_ms = round((perf_counter() - start_time) * 1000, 2)

            logger.exception(
                "HTTP request failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "user_id": str(user.id) if user else None,
                },
            )
            raise

        user = getattr(request.state, "user", None)
        duration_ms = round((perf_counter() - start_time) * 1000, 2)
        logger.info(
            "HTTP request completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "user_id": str(user.id) if user else None,
            },
        )
        return response

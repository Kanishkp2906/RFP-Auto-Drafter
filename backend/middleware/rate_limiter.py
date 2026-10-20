import uuid
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from middleware.public_paths import PUBLIC_PATHS
from middleware.sliding_window import SLIDING_WINDOW_SCRIPT
from dependencies import redis_client

SLIDING_LIMITS = {"/api/documents/uploads": (5, 60), "/api/rag/chat": (10, 60)}


class RedisRateLimiter(BaseHTTPMiddleware):
    def __init__(self, app, limit=20, window=60):
        super().__init__(app)
        self.limit = limit
        self.window = window
        self.sliding_script = redis_client.register_script(SLIDING_WINDOW_SCRIPT)

    async def dispatch(self, request: Request, call_next):

        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        user = getattr(request.state, "user", None)

        if user is None:
            return JSONResponse(
                status_code=401, content={"detail": "Authentication required."}
            )

        config = SLIDING_LIMITS.get(request.url.path)

        if config and request.method == "POST":
            limit, window = config
            key = f"ratelimiting:sliding:{user.id}: {request.url.path}"

            allowed, retry_after = await self.sliding_script(
                keys=[key],
                args=[window * 1000, limit, uuid.uuid4().hex],
            )

            if not allowed:
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                    content={
                        "detail": "Rate limit exceeded.",
                        "retry_after": retry_after,
                    },
                )

        else:
            redis_key = f"ratelimiting: {user.id}"
            count = await redis_client.incr(redis_key)

            if count == 1:
                await redis_client.expire(redis_key, self.window)

            if count > self.limit:
                ttl = await redis_client.ttl(redis_key)

                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": str(max(ttl, 1))},
                    content={
                        "detail": "Rate limit exceeded.",
                        "retry_after": ttl,
                    },
                )

        return await call_next(request)

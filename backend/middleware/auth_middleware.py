from fastapi import Request
from fastapi.responses import JSONResponse
from dependencies import get_admin_db
from starlette.middleware.base import BaseHTTPMiddleware
from middleware.public_paths import PUBLIC_PATHS

admin_db = get_admin_db()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):

        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        authorization = request.headers.get("Authorization")

        if not authorization or not authorization.startswith("Bearer "):
            return JSONResponse(
                status_code=401, content={"detail": "Invalid authorization header."}
            )

        token = authorization.removeprefix("Bearer ").strip()

        try:
            user_response = admin_db.auth.get_user(token)
            user = user_response.user

            request.state.user = user

        except Exception:
            return JSONResponse(
                status_code=401, content={"detail": "Invalid or expired token."}
            )

        return await call_next(request)

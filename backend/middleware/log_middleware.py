import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler("app.log"), logging.StreamHandler()],
)

logger = logging.getLogger("FastAPI")


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            start_time = time.time()

            response = await call_next(request)

            duration = round(time.time() - start_time, 4)

            user = getattr(request.state, "user", None)

            if user:
                user_id = user.id

                logger.info(
                    f"{request.method} {request.url.path} - "
                    f"user_id={user_id} - "
                    f"{response.status_code} - "
                    f"{duration}s"
                )

            else:
                logger.info(
                    f"{request.method} {request.url.path} - "
                    f"anonymous - "
                    f"{response.status_code} - "
                    f"{duration}s"
                )

            return response

        except Exception:
            logger.exception(
                f"Error while processing: {request.method} - {request.url.path}"
            )
            raise

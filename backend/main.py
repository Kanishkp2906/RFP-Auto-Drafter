from fastapi import FastAPI
from routes import files, users, rag, healthcheck, sessions
from contextlib import asynccontextmanager
from config import supabase_db_uri, frontend_url
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool
from agent.graph import builder
from middleware.log_middleware import logger
from fastapi.middleware.cors import CORSMiddleware
from middleware.log_middleware import LoggerMiddleware
from middleware.rate_limiter import RedisRateLimiter
from middleware.auth_middleware import AuthMiddleware
from middleware.logging_config import configure_logging
from dependencies import async_admin_db

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("__RFP Server is starting.")
    await async_admin_db()

    pool = AsyncConnectionPool(
        conninfo=supabase_db_uri,
        min_size=1,
        max_size=5,
        kwargs={"autocommit": True},
        check=AsyncConnectionPool.check_connection,
        open=False,
    )

    await pool.open()

    try:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()

        app.state.graph = builder.compile(checkpointer=checkpointer)

        yield

    finally:
        await pool.close()
        logger.info("__RFP Server is shutting down.")


app = FastAPI(title="RFP Auto Drafter", lifespan=lifespan)

app.include_router(users.router)
app.include_router(files.router)
app.include_router(rag.router)
app.include_router(sessions.router)
app.include_router(healthcheck.router)

app.add_middleware(LoggerMiddleware)
app.add_middleware(RedisRateLimiter)
app.add_middleware(AuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

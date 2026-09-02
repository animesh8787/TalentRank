"""TalentRank API application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analytics, auth, candidates, jobs, matches, uploads
from app.core.config import settings
from app.core.database import engine
from app.models import Base
from app.services import embeddings, pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger("talentrank")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    pipeline.start_workers()
    # Load the embedding model off the request path so the first upload is fast.
    embeddings.warm_up()
    logger.info("TalentRank API ready. Database: %s", settings.sqlalchemy_url)
    yield


app = FastAPI(
    title="TalentRank API",
    description="Resume screening and explainable candidate ranking.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for router in (
    auth.router, jobs.router, candidates.router, uploads.router,
    matches.router, analytics.router,
):
    app.include_router(router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Reports which matching backend is live so the UI can be honest about it."""
    return {
        "status": "ok",
        "version": app.version,
        "database": "sqlite" if settings.is_sqlite else "external",
        "matching": embeddings.backend_status(),
    }

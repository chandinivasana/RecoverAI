import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .core.schema_guard import ensure_columns
from .core.seed_data import seed_database
from .core.demo_warmup import warm_start_demo
from .api import payments, recovery, policies, reviews, evaluation, analytics, replay, redteam, audit


def _env_flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: create tables, apply additive column guards, then (optionally) seed.
    # Gated by env so importing this module (tests, tooling, context generation)
    # stays side-effect free and CI never seeds implicitly.
    Base.metadata.create_all(bind=engine)
    ensure_columns(engine)
    if _env_flag("SEED_ON_STARTUP", "true"):
        db = SessionLocal()
        try:
            seed_database(db, total_dev=800, total_eval=200)
            if _env_flag("DEMO_WARM_START", "false"):
                warm_start_demo(db)
        finally:
            db.close()
    yield


app = FastAPI(
    title="RecoverAI — Agentic Payment Recovery & Revenue Intelligence API",
    description="Track 3 Buildathon MVP: Decision + Recovery + Measurement System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: explicit origins only. Wildcard origins with credentials is an invalid
# combination browsers reject — and a payments API should name its consumers.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(payments.router)
app.include_router(recovery.router)
app.include_router(policies.router)
app.include_router(reviews.router)
app.include_router(evaluation.router)
app.include_router(analytics.router)
app.include_router(replay.router)
app.include_router(redteam.router)
app.include_router(audit.router)

@app.get("/")
def root():
    return {
        "name": "RecoverAI API",
        "status": "online",
        "track": "Track 3 — AI Revenue Recovery",
        "principle": "AI proposes → Policy validates → System executes → Audit records → Metrics measure."
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "connected"}

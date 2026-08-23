from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from .core.seed_data import seed_database
from .api import payments, recovery, policies, reviews, evaluation, analytics, replay, redteam

# Initialize DB Tables
Base.metadata.create_all(bind=engine)

# Seed dataset on initial run
db = SessionLocal()
try:
    seed_database(db, total_dev=800, total_eval=200)
finally:
    db.close()

app = FastAPI(
    title="RecoverAI — Agentic Payment Recovery & Revenue Intelligence API",
    description="Track 3 Buildathon MVP: Decision + Recovery + Measurement System",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

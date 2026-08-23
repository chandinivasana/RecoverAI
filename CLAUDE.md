# CLAUDE.md — Agent & Assistant Guidelines

## Build & Test Commands
- **Backend Setup**: `cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
- **Run Backend**: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- **Run Tests**: `pytest -v tests/`
- **Frontend Setup**: `cd frontend && npm install`
- **Run Frontend**: `npm run dev`
- **Lint**: `npm run lint` / `flake8 backend`

## Architecture & Code Standards
- **Python**: Python 3.9+, FastAPI, Pydantic v2, SQLAlchemy / SQLite.
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Recharts, Framer Motion.
- **Policy Enforcement**: Any code path attempting recovery MUST pass through `PolicyEngine.evaluate()`.
- **Currency Format**: INR (₹) formatting with Indian numbering format (lakhs/crores).
- **Safety Priority**: When uncertain, escalate to human or stop. Never perform unapproved autonomous financial actions.

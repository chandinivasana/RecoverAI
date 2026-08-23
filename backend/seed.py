"""
CLI shim over the canonical seeder (app/core/seed_data.py).

Usage (from backend/):
    python3 seed.py            # seed 800 dev + 200 eval if DB has < 1000 payments
    python3 seed.py --force    # wipe payments/events and reseed from scratch

There is exactly ONE seeder — app.core.seed_data.seed_database — used by this
shim, by API startup (SEED_ON_STARTUP), and by tests. Keep it that way.
"""
import sys

from app.core.schema_guard import ensure_columns
from app.core.seed_data import seed_database
from app.database import Base, SessionLocal, engine


def main() -> None:
    force = "--force" in sys.argv
    Base.metadata.create_all(bind=engine)
    ensure_columns(engine)
    db = SessionLocal()
    try:
        seed_database(db, total_dev=800, total_eval=200, force=force)
        from app.models import DBPayment
        total = db.query(DBPayment).count()
        print(f"Seed complete. payments={total} (force={force})")
    finally:
        db.close()


if __name__ == "__main__":
    main()

"""
Minimal additive schema guard (migrations-lite).

`Base.metadata.create_all` creates missing tables but never alters existing ones.
This helper adds newly-introduced nullable columns to an existing database so a
pre-existing `recoverai.db` (or Postgres volume) keeps working after upgrades.
Additive-only by design; anything more belongs in a real migration tool.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table -> {column_name: SQL type}
ADDITIVE_COLUMNS = {
    "payments": {
        "ground_truth_recoverable": "BOOLEAN",
        "ground_truth_prob": "FLOAT",
        "outcome_seed": "INTEGER",
        "merchant_id": "VARCHAR(64)",
    },
    "audit_events": {
        "prev_hash": "VARCHAR(64)",
        "entry_hash": "VARCHAR(64)",
    },
    "recovery_executions": {
        "decision_id": "VARCHAR(64)",
    },
}


def ensure_columns(engine: Engine) -> list:
    """Adds any missing additive columns. Returns list of 'table.column' added."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    added = []
    with engine.begin() as conn:
        for table, columns in ADDITIVE_COLUMNS.items():
            if table not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns.items():
                if name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))
                    added.append(f"{table}.{name}")
    return added

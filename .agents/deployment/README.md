# Deployment Guidelines

## Docker Deployment
```bash
docker-compose up --build
```

## Environment Configuration
- `DATABASE_URL`: `sqlite:///./recoverai.db` (or `postgresql://...`)
- `VULCAN_ENABLED`: `true` / `false`
- `LLM_API_KEY`: Optional; system gracefully uses internal deterministic intelligence and local rules if not set.

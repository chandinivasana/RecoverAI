import json
import os
import time
from typing import Any

try:
    import redis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

class RedisManager:
    """
    Redis In-Memory State, Cache & Rate-Limiter Client.
    Connects to Redis server via REDIS_URL with transparent fallback to in-memory store.
    """
    _client = None
    _memory_store: dict[str, Any] = {}
    _memory_expiry: dict[str, float] = {}

    @classmethod
    def get_client(cls):
        if cls._client is None and _REDIS_AVAILABLE:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            try:
                client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1)
                client.ping()
                cls._client = client
            except Exception:
                # Redis not running locally; fallback to in-memory mock
                cls._client = False
        return cls._client if cls._client else None

    @classmethod
    def get(cls, key: str) -> str | None:
        client = cls.get_client()
        if client:
            try:
                return client.get(key)
            except Exception:
                pass
        
        # In-memory fallback
        now = time.time()
        if key in cls._memory_expiry and now > cls._memory_expiry[key]:
            cls._memory_store.pop(key, None)
            cls._memory_expiry.pop(key, None)
            return None
        return cls._memory_store.get(key)

    @classmethod
    def set(cls, key: str, value: str, ex: int | None = None) -> bool:
        client = cls.get_client()
        if client:
            try:
                client.set(key, value, ex=ex)
                return True
            except Exception:
                pass

        # In-memory fallback
        cls._memory_store[key] = str(value)
        if ex:
            cls._memory_expiry[key] = time.time() + ex
        return True

    @classmethod
    def incr(cls, key: str, ex: int | None = None) -> int:
        client = cls.get_client()
        if client:
            try:
                val = client.incr(key)
                if ex and val == 1:
                    client.expire(key, ex)
                return val
            except Exception:
                pass

        # In-memory fallback
        val = int(cls.get(key) or 0) + 1
        cls.set(key, str(val), ex=ex)
        return val

    @classmethod
    def set_merchant_env(cls, merchant_id: str, mode: str) -> bool:
        """Stores 'test' vs 'live' mode per merchant."""
        return cls.set(f"merchant:{merchant_id}:env_mode", mode)

    @classmethod
    def get_merchant_env(cls, merchant_id: str) -> str:
        """Retrieves active merchant mode (default: 'test')."""
        return cls.get(f"merchant:{merchant_id}:env_mode") or "test"

    @classmethod
    def publish_event(cls, channel: str, message: dict[str, Any]) -> None:
        """Publishes live agent decision telemetry."""
        client = cls.get_client()
        if client:
            try:
                client.publish(channel, json.dumps(message))
            except Exception:
                pass

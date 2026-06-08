from datetime import datetime, timezone


def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

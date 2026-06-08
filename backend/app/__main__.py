import uvicorn

from app.core.config import settings


def main() -> None:
    reload_enabled = settings.app_env.lower() == "development"
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.port,
        reload=reload_enabled,
    )


if __name__ == "__main__":
    main()

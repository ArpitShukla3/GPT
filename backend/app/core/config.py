from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "aiChat Backend"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    port: int = 8000
    postgres_uri: str
    supabase_pass: str
    pgvector_uri: str
    database_url: str = "sqlite:///./app.db"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    huggingfacehub_api_token: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    google_client_id: str | None = None
    auth_session_days: int = 30
    langchain_tracing_v2: str
    langchain_endpoint: str
    langchain_api_key: str
    langchain_project: str
    google_api_key: str
    gemini_api_key: str
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

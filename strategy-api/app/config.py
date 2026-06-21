from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    postgres_host:     str = "postgres"
    postgres_port:     int = 5432
    postgres_user:     str = "tradekaro"
    postgres_password: str = "tradekaro"
    postgres_db:       str = "abhitrade_live"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── Auth ──────────────────────────────────────────────────────────────────
    jwt_secret:    str  = "change-me-in-production"
    jwt_algorithm: str  = "HS256"
    auth_enabled:  bool = True

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_host:     str = "redis"
    redis_port:     int = 6379
    redis_password: str = ""
    redis_db:       int = 0

    # ── Angel One (for daily scrip sync) ──────────────────────────────────────
    angel_one_api_key:     str = ""
    angel_one_client_id:   str = ""
    angel_one_password:    str = ""
    angel_one_totp_secret: str = ""

    # ── Market hours ──────────────────────────────────────────────────────────
    market_tz: str = "Asia/Kolkata"

    # ── Misc ──────────────────────────────────────────────────────────────────
    log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "ORBIT API"
    ENV: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    POSTGRES_HOST: str = "orbit-db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "orbit"
    POSTGRES_PASSWORD: str = "orbit"
    POSTGRES_DB: str = "orbit"

    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_TTL_MINUTES: int = 30
    REFRESH_TOKEN_TTL_DAYS: int = 14

    CORS_ORIGINS: str = "http://localhost:3000"

    SEED_ON_STARTUP: bool = True
    DEMO_PASSWORD: str = "orbit1234"

    # AI provider abstraction
    AI_PROVIDER: str = "deterministic"  # deterministic | openai | ollama
    AI_BASE_URL: str = ""
    AI_API_KEY: str = ""
    AI_MODEL: str = ""

    # Storage abstraction
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "/data/files"
    S3_ENDPOINT: str = ""
    S3_BUCKET: str = "orbit"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    RATE_LIMIT_PER_MINUTE: int = 600

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

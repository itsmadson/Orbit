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

    # AI assistant: any OpenAI-compatible chat API (GapGPT by default). When a key
    # is present the assistant is an agent that can read and change the workspace;
    # without one, Orbit AI falls back to the AI_PROVIDER above.
    ASSISTANT_API_BASE: str = "https://api.gapgpt.app/v1"
    ASSISTANT_API_KEY: str = ""
    GAPGPT_API_KEY: str = ""
    ASSISTANT_MODEL: str = "glm-4-flash"
    ASSISTANT_TOOL_MODE: str = "auto"  # auto | native | prompt
    ASSISTANT_TEMPERATURE: float = 0.3
    ASSISTANT_TIMEOUT: int = 120
    ASSISTANT_MAX_STEPS: int = 6
    ASSISTANT_DAILY_LIMIT: int = 100
    ASSISTANT_MAX_INPUT: int = 4000

    # Issue-tracker integrations (GitHub, GitLab, Jira)
    INTEGRATION_SYNC_ENABLED: bool = True
    INTEGRATION_SYNC_SECONDS: int = 300
    INTEGRATION_TIMEOUT: int = 25
    INTEGRATION_IMPORT_LIMIT: int = 300

    # Storage abstraction
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "/data/files"
    S3_ENDPOINT: str = ""
    S3_BUCKET: str = "orbit"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    RATE_LIMIT_PER_MINUTE: int = 600

    #: Uptime monitoring runs in-process; turn it off for a read-only replica.
    MONITORING_ENABLED: bool = True
    MONITOR_POLL_SECONDS: int = 30

    #: Ceiling for a single uploaded file.
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def assistant_api_key(self) -> str:
        return self.ASSISTANT_API_KEY or self.GAPGPT_API_KEY

    @property
    def assistant_api_base(self) -> str:
        return self.ASSISTANT_API_BASE.rstrip("/")

    @property
    def assistant_tool_mode(self) -> str:
        mode = self.ASSISTANT_TOOL_MODE.strip().lower()
        return mode if mode in ("auto", "native", "prompt") else "auto"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://fi:fi@localhost:5432/fi"
    redis_url: str = "redis://localhost:6379"
    internal_service_token: str = "change-me"
    search_provider: str = "tavily"
    run_budget_usd_quick: float = 1.0
    run_budget_usd_standard: float = 4.0
    run_budget_usd_deep: float = 12.0


settings = Settings()

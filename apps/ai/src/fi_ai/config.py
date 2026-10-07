from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Infrastructure (unchanged)
    database_url: str = "postgresql+psycopg://fi:fi@localhost:5432/fi"
    redis_url: str = "redis://localhost:6379"
    internal_service_token: str = "change-me"
    search_provider: str = "tavily"
    run_budget_usd_quick: float = 1.0
    run_budget_usd_standard: float = 4.0
    run_budget_usd_deep: float = 12.0

    # Environment gate (new)
    app_env: str = "development"

    # Provider keys (new)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    tavily_api_key: str | None = None
    exa_api_key: str | None = None

    @model_validator(mode="after")
    def _fail_fast_on_default_token(self) -> "Settings":
        if self.app_env != "development" and self.internal_service_token == "change-me":
            raise ValueError(
                f"INTERNAL_SERVICE_TOKEN must be changed from the default in {self.app_env!r} environment"
            )
        return self


settings = Settings()

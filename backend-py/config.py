"""CASTmir backend — settings, loaded from environment (.env locally, App Runner env vars in production)."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "local"  # local / production
    cors_origins: str = "http://localhost:5173"

    duckdb_path: str = "./data/castmir.duckdb"
    # App Runner containers have no persistent local disk — it resets to
    # empty on every redeploy and can reset on the platform's own instance
    # recycling too. The DuckDB file backs up to this S3 bucket on an
    # interval and restores from it on startup so data actually survives
    # those resets. Empty bucket name disables backup/restore (e.g. local
    # dev, where the local file itself is already persistent).
    s3_backup_bucket: str = ""
    s3_backup_key: str = "castmir.duckdb"
    s3_backup_interval_seconds: int = 60

    aws_region: str = "us-east-1"
    bedrock_model_id: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

    threat_score_threshold: float = 0.65
    cusum_h: float = 5.0
    cusum_k: float = 0.5

    ocsf_version: str = "1.5.0"
    siem_webhook_url: str | None = None

    jwt_secret: str = "dev-secret-change-in-production"
    admin_token: str = "dev-admin-token-change-in-production"

    class Config:
        env_file = ".env"


settings = Settings()

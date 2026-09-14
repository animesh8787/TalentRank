"""Application configuration.

Values come from environment variables, optionally seeded from a .env file next
to the backend package. No third-party dotenv dependency — the loader below is
deliberately tiny so the app has one less thing that can fail to install.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """Populate os.environ from a .env file without overriding real env vars."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve(raw: str) -> Path:
    """Resolve a possibly-relative path against the backend directory."""
    p = Path(raw)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./storage/talentrank.db")
    firebase_credentials_file: Path = field(
        default_factory=lambda: _resolve(
            os.getenv("FIREBASE_CREDENTIALS_FILE", "./firebase-service-account.json")
        )
    )
    # Alternative to the file above: the service account JSON's raw content,
    # for hosts (Render, etc.) whose blueprints can set env vars but can't
    # provision a secret file. Takes priority over the file when set.
    firebase_credentials_json: str | None = os.getenv("FIREBASE_CREDENTIALS_JSON")
    storage_dir: Path = field(default_factory=lambda: _resolve(os.getenv("STORAGE_DIR", "./storage/resumes")))
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    embeddings_enabled: bool = field(default_factory=lambda: _bool("EMBEDDINGS_ENABLED", True))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip()
            for o in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if o.strip()
        )
    )

    @property
    def sqlalchemy_url(self) -> str:
        """Normalise a relative sqlite path so it resolves from any cwd."""
        url = self.database_url
        prefix = "sqlite:///./"
        if url.startswith(prefix):
            return f"sqlite:///{(BACKEND_DIR / url[len(prefix):]).as_posix()}"
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.sqlalchemy_url.startswith("sqlite")


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)

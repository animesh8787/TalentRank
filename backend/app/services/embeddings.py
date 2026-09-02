"""Semantic text embeddings with a graceful offline fallback.

The old system scored with `TfidfVectorizer.fit_transform([resume, job])` per
candidate. That is wrong twice over: a two-document corpus makes IDF meaningless,
and refitting per candidate means scores are computed in different vector spaces
and cannot be compared to each other — which is exactly what a ranking does.

Here a single sentence-transformer encodes everything into one shared space, so
cosine similarities are directly comparable. If the model cannot be loaded (no
network on first run, or EMBEDDINGS_ENABLED=false), we fall back to a TF-IDF
vectoriser fitted **once over the whole corpus**, which is still comparable.
"""
from __future__ import annotations

import logging
import threading

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
# "idle" -> "loading" -> "ready" | "failed" | "disabled".
# A single boolean cannot distinguish "still loading" from "failed", which made
# /api/health report the fallback while the model was still downloading.
_state = "idle"
_load_error: str | None = None


def _load_model():
    """Load the sentence-transformer once, tolerating failure."""
    global _model, _state, _load_error

    if _state in {"ready", "failed", "disabled"}:
        return _model

    with _model_lock:
        if _state in {"ready", "failed", "disabled", "loading"}:
            return _model

        if not settings.embeddings_enabled:
            _state = "disabled"
            _load_error = "Embeddings disabled by configuration."
            logger.info(_load_error)
            return None

        _state = "loading"

    try:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model %s ...", settings.embedding_model)
        model = SentenceTransformer(settings.embedding_model)
    except Exception as exc:  # noqa: BLE001 - any failure means fallback
        _load_error = f"{type(exc).__name__}: {exc}"
        _state = "failed"
        logger.warning(
            "Could not load embedding model (%s). Falling back to TF-IDF.", _load_error
        )
        return None

    _model = model
    _state = "ready"
    logger.info("Embedding model ready.")
    return _model


def _wait_for_model(timeout: float = 120.0):
    """Block until a concurrent warm-up finishes, then return the model."""
    import time

    deadline = time.monotonic() + timeout
    while _state == "loading" and time.monotonic() < deadline:
        time.sleep(0.1)
    return _model


def backend_status() -> dict[str, object]:
    """Reported on /api/health so the UI can show which matcher is live."""
    ready = _state == "ready"
    state = {
        "ready": "ready",
        "loading": "loading",
        "idle": "loading",
        "disabled": "disabled",
        "failed": "unavailable",
    }[_state]

    return {
        "backend": "sentence-transformers" if ready or state == "loading" else "tfidf",
        "state": state,
        "model": settings.embedding_model if ready else "tfidf-fallback",
        "enabled": settings.embeddings_enabled,
        "loaded": ready,
        "error": _load_error,
    }


def warm_up() -> None:
    """Load the model off the request path, at application startup."""
    threading.Thread(target=_load_model, name="embedding-warmup", daemon=True).start()


def embed(texts: list[str]) -> list[list[float]] | None:
    """Encode texts into unit-normalised vectors, or None if unavailable."""
    if not texts:
        return []
    model = _load_model()
    if model is None and _state == "loading":
        # A warm-up is in flight — wait for it rather than silently downgrading
        # this request to the keyword fallback.
        model = _wait_for_model()
    if model is None:
        return None
    vectors = model.encode(
        texts, normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True
    )
    return [v.astype(float).tolist() for v in vectors]


def embed_one(text: str) -> list[float] | None:
    result = embed([text])
    return result[0] if result else None


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    """Cosine similarity of two vectors, clamped to [0, 1]."""
    if not a or not b or len(a) != len(b):
        return 0.0
    va, vb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denominator = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denominator == 0.0:
        return 0.0
    return float(max(0.0, min(1.0, float(np.dot(va, vb)) / denominator)))


def tfidf_similarities(query: str, documents: list[str]) -> list[float]:
    """Fallback path: fit TF-IDF once over the whole corpus, then compare.

    Fitting over `documents + [query]` together is what makes the resulting
    scores comparable across candidates.
    """
    if not documents:
        return []
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        corpus = documents + [query]
        vectorizer = TfidfVectorizer(stop_words="english", max_features=20_000)
        matrix = vectorizer.fit_transform(corpus)
        scores = cosine_similarity(matrix[-1], matrix[:-1])[0]
        return [float(max(0.0, min(1.0, s))) for s in scores]
    except Exception as exc:  # noqa: BLE001 - never let scoring die on this
        logger.warning("TF-IDF fallback failed: %s", exc)
        return [0.0] * len(documents)


def similarity_matrix(sources: list[str], targets: list[str]) -> np.ndarray | None:
    """Pairwise cosine similarity between two text lists, or None if no model."""
    if not sources or not targets:
        return None
    source_vectors = embed(sources)
    target_vectors = embed(targets)
    if source_vectors is None or target_vectors is None:
        return None
    return np.asarray(source_vectors) @ np.asarray(target_vectors).T

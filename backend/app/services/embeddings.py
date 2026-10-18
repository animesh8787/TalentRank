"""Semantic text embeddings with a graceful offline fallback.

Scoring compares a resume with a job in one shared vector space, so similarities
are directly comparable across candidates. Three backends, tried in this order:

1. **Hugging Face Inference API** (set `HF_TOKEN`). Embeddings are computed
   remotely, so the server needs no torch and fits a 512 MB free-tier host.
2. **Local sentence-transformers** (optional: `pip install -r requirements-ml.txt`).
   Same default model, so vectors from backends 1 and 2 are interchangeable.
3. **TF-IDF** fitted once over the whole corpus. No model, still comparable
   across candidates, but lexical only: "ML" will not match "machine learning".

`EMBEDDINGS_ENABLED=false` forces backend 3. `/api/health` reports which one is
live.
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from collections import OrderedDict

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
# "idle" -> "loading" -> "ready" | "failed" | "disabled".
# A single boolean cannot distinguish "still loading" from "failed", which made
# /api/health report the fallback while the model was still downloading.
_state = "idle"
_backend = "tfidf"  # "hf-inference" | "sentence-transformers" | "tfidf"
_load_error: str | None = None

_HF_BATCH = 16
_HF_MAX_CHARS = 1500  # the model reads ~256 tokens; keep requests small
_HF_TIMEOUT = 30

# Skill names repeat across every candidate/job pair, so cache their vectors:
# without this a remote backend would make a network call per pair.
_term_cache: OrderedDict[str, list[float]] = OrderedDict()
_TERM_CACHE_MAX = 5000
_cache_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Hugging Face Inference API
# --------------------------------------------------------------------------- #
def _hf_embed(texts: list[str]) -> list[list[float]]:
    """Embed texts through the HF Inference API; raises on any failure."""
    url = settings.hf_embeddings_url.format(model=settings.embedding_model)
    vectors: list[list[float]] = []
    for start in range(0, len(texts), _HF_BATCH):
        chunk = [t[:_HF_MAX_CHARS] or " " for t in texts[start:start + _HF_BATCH]]
        body = json.dumps({"inputs": chunk, "options": {"wait_for_model": True}}).encode()
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {settings.hf_token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=_HF_TIMEOUT) as response:
                payload = json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"HF Inference API returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise RuntimeError(f"HF Inference API unreachable: {exc}") from None
        if (
            not isinstance(payload, list)
            or len(payload) != len(chunk)
            or not all(isinstance(row, list) and row and isinstance(row[0], float) for row in payload)
        ):
            raise RuntimeError("HF Inference API returned an unexpected shape")
        vectors.extend(payload)

    matrix = np.asarray(vectors, dtype=float)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (matrix / norms).tolist()


# --------------------------------------------------------------------------- #
# Backend selection
# --------------------------------------------------------------------------- #
def _load_model():
    """Pick and initialise a backend once, tolerating failure."""
    global _model, _state, _backend, _load_error

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

    if settings.hf_token:
        try:
            _hf_embed(["warm-up"])
        except Exception as exc:  # noqa: BLE001 - fall through to the local model
            _load_error = f"{type(exc).__name__}: {exc}"
            logger.warning("HF Inference API unusable (%s); trying a local model.", _load_error)
        else:
            _backend, _state, _load_error = "hf-inference", "ready", None
            logger.info("Embeddings via Hugging Face Inference API (%s).", settings.embedding_model)
            return None

    try:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model %s ...", settings.embedding_model)
        model = SentenceTransformer(settings.embedding_model)
    except Exception as exc:  # noqa: BLE001 - any failure means fallback
        _load_error = _load_error or f"{type(exc).__name__}: {exc}"
        _state = "failed"
        logger.warning(
            "No embedding backend available (%s). Falling back to TF-IDF.", _load_error
        )
        return None

    _model = model
    _backend, _state, _load_error = "sentence-transformers", "ready", None
    logger.info("Embedding model ready.")
    return _model


def _wait_for_model(timeout: float = 120.0) -> None:
    """Block until a concurrent warm-up finishes."""
    import time

    deadline = time.monotonic() + timeout
    while _state == "loading" and time.monotonic() < deadline:
        time.sleep(0.1)


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
        "backend": _backend if ready else ("embeddings" if state == "loading" else "tfidf"),
        "state": state,
        "model": settings.embedding_model if ready else "tfidf-fallback",
        "enabled": settings.embeddings_enabled,
        "loaded": ready,
        "error": _load_error,
    }


def warm_up() -> None:
    """Initialise the backend off the request path, at application startup."""
    threading.Thread(target=_load_model, name="embedding-warmup", daemon=True).start()


def embed(texts: list[str]) -> list[list[float]] | None:
    """Encode texts into unit-normalised vectors, or None if unavailable."""
    if not texts:
        return []
    model = _load_model()
    if _state == "loading":
        # A warm-up is in flight — wait for it rather than silently downgrading
        # this request to the keyword fallback.
        _wait_for_model()
        model = _model
    if _state != "ready":
        return None
    if _backend == "hf-inference":
        try:
            return _hf_embed(texts)
        except Exception as exc:  # noqa: BLE001 - a flaky API must not fail scoring
            logger.warning("HF embedding request failed (%s); using TF-IDF for this request.", exc)
            return None
    if model is None:
        return None
    vectors = model.encode(
        texts, normalize_embeddings=True, show_progress_bar=False, convert_to_numpy=True
    )
    return [v.astype(float).tolist() for v in vectors]


def embed_one(text: str) -> list[float] | None:
    result = embed([text])
    return result[0] if result else None


def embed_terms(terms: list[str]) -> list[list[float]] | None:
    """Like `embed`, for short repeated strings (skill names), with a cache."""
    with _cache_lock:
        missing = list(dict.fromkeys(t for t in terms if t not in _term_cache))
    if missing:
        fresh = embed(missing)
        if fresh is None:
            return None
        with _cache_lock:
            for term, vector in zip(missing, fresh):
                _term_cache[term] = vector
            while len(_term_cache) > _TERM_CACHE_MAX:
                _term_cache.popitem(last=False)
    with _cache_lock:
        try:
            return [_term_cache[t] for t in terms]
        except KeyError:  # evicted between the two steps; extremely rare
            return embed(terms)


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
    source_vectors = embed_terms(sources)
    target_vectors = embed_terms(targets)
    if source_vectors is None or target_vectors is None:
        return None
    return np.asarray(source_vectors) @ np.asarray(target_vectors).T

"""The scorer's documented numbers must match the code."""
from __future__ import annotations

import pytest

from app.models import Job
from app.schemas import JobWeights
from app.services import anonymize, scoring, taxonomy as tx


def test_seven_dimensions_with_documented_default_weights():
    assert scoring.DIMENSIONS == (
        "skills", "experience", "education", "semantic", "location", "projects", "certifications"
    )
    assert scoring.DEFAULT_WEIGHTS == {
        "skills": 0.30, "experience": 0.20, "education": 0.10, "semantic": 0.15,
        "location": 0.10, "projects": 0.10, "certifications": 0.05,
    }
    assert sum(scoring.DEFAULT_WEIGHTS.values()) == pytest.approx(1.0)
    # The three places that declare defaults must agree.
    assert JobWeights().model_dump() == scoring.DEFAULT_WEIGHTS
    columns = {c.name: c.default.arg for c in Job.__table__.columns if c.name.startswith("weight_")}
    assert {k.removeprefix("weight_"): v for k, v in columns.items()} == scoring.DEFAULT_WEIGHTS


def test_four_of_five_years_scores_point_eight_five():
    score, _ = scoring.score_experience(4, 5)
    assert round(score, 2) == 0.85
    assert scoring.score_experience(5, 5)[0] == 1.0
    assert scoring.score_experience(0, 5)[0] == 0.0


def test_weights_are_normalised_and_zero_falls_back_to_defaults():
    normalised = scoring.normalise_weights({"skills": 2, "experience": 2})
    assert sum(normalised.values()) == pytest.approx(1.0)
    assert normalised["skills"] == pytest.approx(0.5)
    assert scoring.normalise_weights({}) == scoring.DEFAULT_WEIGHTS


def test_projects_and_certifications_contribute_to_the_total():
    common = dict(
        candidate_skills=["python"], candidate_experience=5, candidate_education="Bachelors",
        candidate_location="Pune", resume_text="python", required_skills=["python"],
        required_experience=5, required_education="Bachelors", job_location="Pune",
        remote_ok=False, weights=scoring.DEFAULT_WEIGHTS, semantic_similarity=0.0,
    )
    bare = scoring.score_candidate(**common)
    rich = scoring.score_candidate(
        **common,
        candidate_projects=[{"name": "a", "technologies": ["python"]}] * 3,
        candidate_certifications=[{"name": "x"}, {"name": "y"}],
    )
    assert rich.overall == pytest.approx(bare.overall + 0.10 + 0.05, abs=0.001)


def test_skill_alias_table_is_small_and_lexical():
    assert len(tx.SKILL_ALIASES) <= 15
    assert tx.canonical_skill("K8s") == "kubernetes"
    # Long-form synonyms are the embedding model's job, not a lookup table's.
    assert tx.canonical_skill("amazon web services") == "amazon web services"


def test_anonymize_strips_identity_everywhere():
    payload = {
        "id": 7, "full_name": "Priya Nair", "email": "priya@x.com", "phone": "+911234567890",
        "location": "Pune", "university": "IIT Delhi University", "linkedin_url": "u",
        "github_url": "u", "portfolio_url": "u", "headline": "Priya Nair Data Scientist",
        "source_filename": "Priya_Nair_CV.pdf", "latest_upload_id": 3,
        "resume_text": "Priya Nair\npriya@x.com +911234567890\nGender: Female\nBuilt models.",
        "educations": [{"institution": "IIT", "degree": "B.Tech"}],
    }
    out = anonymize.anonymize_candidate(payload)
    assert out["full_name"] == anonymize.alias_for(7)
    for field in ("email", "phone", "location", "university", "source_filename", "latest_upload_id"):
        assert out[field] is None
    assert "Priya" not in out["resume_text"] and "priya@x.com" not in out["resume_text"]
    assert "Female" not in out["resume_text"]
    assert out["educations"][0]["institution"] is None
    assert "Priya" not in (out["headline"] or "")

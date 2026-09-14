"""Explainable candidate scoring.

Five dimensions, each in [0, 1], combined with per-job weights that are
normalised so a partially-edited weight set can never distort a ranking.
Every dimension returns not just a number but the reason for it, so the UI can
answer "why is this person ranked third?".
"""
from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field

from app.services import embeddings, taxonomy as tx

# A required skill counts as semantically matched above this cosine similarity.
SEMANTIC_SKILL_THRESHOLD = 0.62

DIMENSIONS = ("skills", "experience", "education", "semantic", "location")


@dataclass
class SkillMatch:
    required: str
    matched_with: str | None = None
    kind: str = "missing"  # exact | alias | semantic | missing
    similarity: float = 0.0
    evidence: str | None = None


@dataclass
class DimensionScore:
    key: str
    label: str
    score: float
    weight: float
    contribution: float
    detail: str

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class ScoreResult:
    overall: float
    dimensions: dict[str, DimensionScore] = field(default_factory=dict)
    matched_skills: list[dict] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    evidence: list[dict] = field(default_factory=list)
    summary: str = ""

    def explanation(self) -> dict:
        return {
            "dimensions": {k: v.as_dict() for k, v in self.dimensions.items()},
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "evidence": self.evidence,
            "summary": self.summary,
        }


# --------------------------------------------------------------------------- #
# Individual dimensions
# --------------------------------------------------------------------------- #
def score_skills(
    candidate_skills: list[str],
    required_skills: list[str],
    resume_text: str = "",
) -> tuple[float, list[SkillMatch], str]:
    """Exact + alias + embedding-based skill matching, with evidence."""
    required = [tx.canonical_skill(s) for s in required_skills if s and s.strip()]
    required = list(dict.fromkeys(required))  # de-dupe, keep order
    if not required:
        return 0.0, [], "No required skills specified for this role."

    have = {tx.canonical_skill(s): s for s in candidate_skills if s and s.strip()}
    have_keys = list(have)

    results: list[SkillMatch] = []
    unresolved: list[str] = []

    for want in required:
        if want in have:
            results.append(
                SkillMatch(required=want, matched_with=have[want], kind="exact", similarity=1.0)
            )
        else:
            unresolved.append(want)

    # Resolve the remainder semantically ("ML" vs "machine learning",
    # "React.js" vs "React"), which plain string matching cannot do.
    if unresolved and have_keys:
        matrix = embeddings.similarity_matrix(unresolved, have_keys)
        if matrix is not None:
            for row, want in enumerate(unresolved):
                best_column = int(matrix[row].argmax())
                best_score = float(matrix[row][best_column])
                if best_score >= SEMANTIC_SKILL_THRESHOLD:
                    results.append(
                        SkillMatch(
                            required=want,
                            matched_with=have_keys[best_column],
                            kind="semantic",
                            similarity=round(best_score, 3),
                        )
                    )
                else:
                    results.append(SkillMatch(required=want, kind="missing"))
        else:
            # No embedding model: fall back to substring containment.
            for want in unresolved:
                hit = next((k for k in have_keys if want in k or k in want), None)
                results.append(
                    SkillMatch(
                        required=want,
                        matched_with=have[hit] if hit else None,
                        kind="alias" if hit else "missing",
                        similarity=0.8 if hit else 0.0,
                    )
                )

    # Attach the resume sentence that evidences each match.
    if resume_text:
        for match in results:
            if match.kind == "missing" or not match.matched_with:
                continue
            found = re.search(
                rf"[^.\n]*\b{re.escape(match.matched_with)}\b[^.\n]*", resume_text, re.I
            )
            if found:
                snippet = " ".join(found.group(0).split())
                match.evidence = snippet[:220] + ("..." if len(snippet) > 220 else "")

    # Exact hits count fully; semantic hits are discounted by their similarity.
    total = 0.0
    for match in results:
        if match.kind in ("exact", "alias"):
            total += 1.0
        elif match.kind == "semantic":
            total += match.similarity
    score = max(0.0, min(1.0, total / len(required)))

    hits = sum(1 for m in results if m.kind != "missing")
    detail = f"Matched {hits} of {len(required)} required skills."
    return score, results, detail


def score_experience(candidate_years: float, required_years: float) -> tuple[float, str]:
    """Full credit at or above the requirement, smooth decay below it."""
    candidate_years = max(0.0, float(candidate_years or 0.0))
    required_years = max(0.0, float(required_years or 0.0))

    if required_years <= 0:
        return 1.0, "No minimum experience required."
    if candidate_years >= required_years:
        return 1.0, f"{candidate_years:.0f} yrs meets the {required_years:.0f} yr minimum."
    if candidate_years <= 0:
        return 0.0, f"No experience detected against a {required_years:.0f} yr minimum."

    # log1p keeps near-misses competitive: 4 of 5 years scores ~0.86, not 0.8.
    ratio = candidate_years / required_years
    score = math.log1p(ratio) / math.log(2.0)
    return (
        max(0.0, min(1.0, score)),
        f"{candidate_years:.0f} of {required_years:.0f} yrs required.",
    )


def score_education(candidate_education: str | None, required_education: str | None) -> tuple[float, str]:
    required_rank = tx.education_rank(required_education)
    candidate_rank = tx.education_rank(candidate_education)

    if required_rank == 0:
        return 1.0, "No specific qualification required."
    if candidate_rank == 0:
        return 0.0, "No qualification detected in the resume."

    candidate_label = tx.EDUCATION_LABELS.get(candidate_rank, "Unknown")
    required_label = tx.EDUCATION_LABELS.get(required_rank, "Unknown")

    if candidate_rank >= required_rank:
        return 1.0, f"{candidate_label} meets the {required_label} requirement."
    # One level short scores 0.6, two levels short 0.3.
    gap = required_rank - candidate_rank
    return max(0.0, 1.0 - gap * 0.4), f"{candidate_label} vs {required_label} required."


def score_location(
    candidate_location: str | None, job_location: str | None, remote_ok: bool = False
) -> tuple[float, str]:
    if remote_ok:
        return 1.0, "Role is remote-friendly."
    if not job_location:
        return 1.0, "No location requirement."
    if not candidate_location:
        return 0.0, "Candidate location unknown."

    a = candidate_location.strip().lower()
    b = job_location.strip().lower()
    if a == b:
        return 1.0, f"Based in {candidate_location}."
    if a in b or b in a:
        return 0.85, f"{candidate_location} overlaps {job_location}."

    # Treat the common metro aliases as the same place.
    aliases = [
        {"bangalore", "bengaluru"}, {"mumbai", "bombay"}, {"chennai", "madras"},
        {"kolkata", "calcutta"}, {"gurgaon", "gurugram"}, {"delhi", "new delhi", "ncr", "delhi ncr"},
        {"kochi", "cochin"}, {"mysore", "mysuru"}, {"vizag", "visakhapatnam"},
        {"trivandrum", "thiruvananthapuram"},
    ]
    for group in aliases:
        if any(name in a for name in group) and any(name in b for name in group):
            return 1.0, f"{candidate_location} is the same metro as {job_location}."

    return 0.0, f"{candidate_location} does not match {job_location}."


# --------------------------------------------------------------------------- #
# Combined
# --------------------------------------------------------------------------- #
def normalise_weights(weights: dict[str, float]) -> dict[str, float]:
    """Scale weights to sum to 1.0; fall back to defaults if all are zero."""
    cleaned = {k: max(0.0, float(weights.get(k, 0.0) or 0.0)) for k in DIMENSIONS}
    total = sum(cleaned.values())
    if total <= 0:
        return {"skills": 0.35, "experience": 0.25, "education": 0.15,
                "semantic": 0.15, "location": 0.10}
    return {k: v / total for k, v in cleaned.items()}


def _band(score: float) -> str:
    if score >= 0.80:
        return "Strong match"
    if score >= 0.60:
        return "Good match"
    if score >= 0.40:
        return "Partial match"
    return "Weak match"


def score_candidate(
    *,
    candidate_skills: list[str],
    candidate_experience: float,
    candidate_education: str | None,
    candidate_location: str | None,
    resume_text: str,
    required_skills: list[str],
    required_experience: float,
    required_education: str | None,
    job_location: str | None,
    remote_ok: bool,
    weights: dict[str, float],
    semantic_similarity: float,
) -> ScoreResult:
    """Compute the full explainable score for one candidate against one job."""
    weights = normalise_weights(weights)

    skills_score, skill_matches, skills_detail = score_skills(
        candidate_skills, required_skills, resume_text
    )
    experience_score, experience_detail = score_experience(
        candidate_experience, required_experience
    )
    education_score, education_detail = score_education(
        candidate_education, required_education
    )
    location_score, location_detail = score_location(
        candidate_location, job_location, remote_ok
    )
    semantic_score = max(0.0, min(1.0, float(semantic_similarity or 0.0)))

    raw = {
        "skills": (skills_score, "Skills", skills_detail),
        "experience": (experience_score, "Experience", experience_detail),
        "education": (education_score, "Education", education_detail),
        "semantic": (
            semantic_score,
            "Resume relevance",
            f"{semantic_score:.0%} overall textual similarity to the job description.",
        ),
        "location": (location_score, "Location", location_detail),
    }

    dimensions: dict[str, DimensionScore] = {}
    overall = 0.0
    for key, (value, label, detail) in raw.items():
        weight = weights[key]
        contribution = value * weight
        overall += contribution
        dimensions[key] = DimensionScore(
            key=key,
            label=label,
            score=round(value, 4),
            weight=round(weight, 4),
            contribution=round(contribution, 4),
            detail=detail,
        )

    matched = [
        {
            "required": m.required,
            "matched_with": m.matched_with,
            "kind": m.kind,
            "similarity": m.similarity,
            "evidence": m.evidence,
        }
        for m in skill_matches
        if m.kind != "missing"
    ]
    missing = [m.required for m in skill_matches if m.kind == "missing"]

    evidence = [
        {"skill": m["required"], "snippet": m["evidence"]}
        for m in matched
        if m.get("evidence")
    ][:8]

    overall = round(max(0.0, min(1.0, overall)), 4)
    strongest = max(dimensions.values(), key=lambda d: d.contribution)
    weakest = min(dimensions.values(), key=lambda d: d.contribution)
    summary = (
        f"{_band(overall)} ({overall:.0%}). "
        f"Strongest signal: {strongest.label.lower()} ({strongest.score:.0%}). "
        f"Weakest: {weakest.label.lower()} ({weakest.score:.0%})."
    )

    return ScoreResult(
        overall=overall,
        dimensions=dimensions,
        matched_skills=matched,
        missing_skills=missing,
        evidence=evidence,
        summary=summary,
    )

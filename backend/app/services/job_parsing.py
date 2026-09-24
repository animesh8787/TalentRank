"""Job description → structured draft fields.

Rule-based, in the same spirit as parsing.py's resume extraction, and
deliberately reusing it: skill detection and location detection here call
straight into `parsing.extract_skills` / `parsing.extract_location` rather
than re-implementing them, and education uses the same taxonomy ranking.
Nothing here is ever saved directly — a recruiter pastes a JD, gets this
draft back, and reviews/edits every field before a role is actually created.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services import parsing
from app.services import taxonomy as tx

# Checked in this order — "lead"/"senior" must win over a stray "entry" or
# "junior" mention elsewhere in the same JD (e.g. "mentor junior engineers").
_SENIORITY_ORDER = ["lead", "senior", "mid", "junior", "entry", "internship"]
_SENIORITY_KEYWORDS: dict[str, list[str]] = {
    "lead": ["lead", "principal", "staff", "head of", "architect"],
    "senior": ["senior", "sr.", "sr "],
    "mid": ["mid level", "mid-level", "intermediate"],
    "junior": ["junior", "jr.", "jr "],
    "entry": ["entry level", "entry-level", "fresher", "graduate"],
    "internship": ["internship", "intern", "trainee"],
}

_EMPLOYMENT_KEYWORDS: dict[str, list[str]] = {
    "internship": ["internship", "intern"],
    "contract": ["contract", "contractor", "c2h", "temporary"],
    "freelance": ["freelance", "freelancer"],
    "part_time": ["part-time", "part time"],
    "full_time": ["full-time", "full time", "permanent"],
}

_WORK_MODE_KEYWORDS: dict[str, list[str]] = {
    "remote": ["remote", "work from home", "wfh", "distributed team"],
    "hybrid": ["hybrid"],
    "onsite": ["on-site", "onsite", "in-office", "in office"],
}

_REQUIRED_HEADING_RE = re.compile(
    r"\b(required|must[- ]have|minimum qualifications?|requirements?)\b[:\s]*", re.I
)
_PREFERRED_HEADING_RE = re.compile(
    r"\b(preferred|nice[- ]to[- ]have|bonus points?|good to have|pluses?)\b[:\s]*", re.I
)
_EXPERIENCE_RANGE_RE = re.compile(r"(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.I)
_EXPERIENCE_MIN_RE = re.compile(
    r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*|professional\s*|minimum\s*)?experience",
    re.I,
)


@dataclass
class JDDraft:
    title: str | None = None
    department: str | None = None
    seniority: str | None = None
    employment_type: str | None = None
    work_mode: str | None = None
    location: str | None = None
    required_experience: float = 0.0
    required_experience_max: float | None = None
    required_education: str | None = None
    required_skills: list[str] = field(default_factory=list)
    nice_to_have_skills: list[str] = field(default_factory=list)
    description: str = ""
    # What could not be confidently detected, so the review screen can flag
    # it rather than silently submitting a guess.
    notes: list[str] = field(default_factory=list)


def _guess_title(text: str) -> str | None:
    lines = [ln.strip(" -–:\t") for ln in text.split("\n") if ln.strip()]
    if not lines:
        return None
    first = lines[0]
    # A plausible title line: short, not a sentence, not a section heading.
    if first and 3 <= len(first) <= 80 and len(first.split()) <= 8 and not first.endswith("."):
        return first
    return None


def _guess_from_keywords(text: str, order: list[str], keywords: dict[str, list[str]]) -> str | None:
    lowered = text.lower()
    for key in order:
        if any(kw in lowered for kw in keywords[key]):
            return key
    return None


def _guess_experience(text: str) -> tuple[float, float | None]:
    range_match = _EXPERIENCE_RANGE_RE.search(text)
    if range_match:
        low, high = float(range_match.group(1)), float(range_match.group(2))
        return min(low, high), max(low, high)
    single = [int(m) for m in _EXPERIENCE_MIN_RE.findall(text) if m.isdigit()]
    if single:
        return float(min(single)), None
    return 0.0, None


def _split_required_preferred(text: str) -> tuple[str, str]:
    """Split into a required-ish and a preferred-ish section by heading.

    Falls back to treating the whole text as required when no "preferred /
    nice to have" heading exists at all — the common case for a short JD.
    """
    preferred_match = _PREFERRED_HEADING_RE.search(text)
    if not preferred_match:
        return text, ""
    return text[: preferred_match.start()], text[preferred_match.start():]


def parse_job_description(text: str) -> JDDraft:
    """Best-effort structured draft from a pasted JD. Never raises."""
    text = (text or "").strip()
    draft = JDDraft(description=text)
    if not text:
        draft.notes.append("Paste a job description to extract fields from it.")
        return draft

    draft.title = _guess_title(text)
    if draft.title is None:
        draft.notes.append("Could not confidently detect a job title — check the first line.")

    draft.seniority = _guess_from_keywords(text, _SENIORITY_ORDER, _SENIORITY_KEYWORDS)
    draft.employment_type = _guess_from_keywords(
        text, list(_EMPLOYMENT_KEYWORDS), _EMPLOYMENT_KEYWORDS
    )
    draft.work_mode = _guess_from_keywords(text, list(_WORK_MODE_KEYWORDS), _WORK_MODE_KEYWORDS)
    draft.location = parsing.extract_location(text)
    draft.required_experience, draft.required_experience_max = _guess_experience(text)

    rank = tx.education_rank(text)
    if rank:
        draft.required_education = tx.EDUCATION_LABELS.get(rank)

    required_text, preferred_text = _split_required_preferred(text)
    required_skills = {s.name for s in parsing.extract_skills(required_text)}
    if preferred_text:
        preferred_skills = {s.name for s in parsing.extract_skills(preferred_text)} - required_skills
    else:
        preferred_skills = set()

    draft.required_skills = sorted(required_skills)
    draft.nice_to_have_skills = sorted(preferred_skills)
    if not draft.required_skills and not draft.nice_to_have_skills:
        draft.notes.append(
            "No recognised skills were found in this text — add them manually below."
        )
    if draft.location is None:
        draft.notes.append("Could not detect a location — set it manually if this isn't a remote role.")

    return draft

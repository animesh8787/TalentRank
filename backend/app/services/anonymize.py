"""Bias-reduced review mode (Tier 3).

When a recruiter turns on anonymised review, identifying and demographic
signals are stripped server-side before the payload is serialised. Doing it on
the server matters: hiding fields in the browser would still ship the real
values over the wire, where they can be read.
"""
from __future__ import annotations

import hashlib
import re

from app.services import taxonomy as tx

_ADJECTIVES = [
    "Amber", "Azure", "Bright", "Calm", "Clear", "Crimson", "Golden", "Indigo",
    "Ivory", "Jade", "Lucid", "Noble", "Olive", "Quiet", "Rapid", "Scarlet",
    "Silver", "Steady", "Swift", "Teal", "Vivid", "Warm",
]
_NOUNS = [
    "Falcon", "Harbor", "Lantern", "Meadow", "Mountain", "Orbit", "Pioneer",
    "Quarry", "River", "Summit", "Terrace", "Vector", "Willow", "Anchor",
    "Beacon", "Cedar", "Delta", "Ember", "Forge", "Grove",
]

_DEMOGRAPHIC_RE = re.compile(
    r"\b(" + "|".join(re.escape(term) for term in tx.DEMOGRAPHIC_TERMS) + r")\b\s*[:\-]?\s*\S*",
    re.I,
)


def alias_for(candidate_id: int) -> str:
    """Stable, non-identifying display name, e.g. "Swift Falcon #4821".

    Deterministic so the same candidate keeps the same alias across page loads
    and between recruiters comparing notes.
    """
    digest = hashlib.sha256(f"talentrank:{candidate_id}".encode()).hexdigest()
    value = int(digest[:12], 16)
    adjective = _ADJECTIVES[value % len(_ADJECTIVES)]
    noun = _NOUNS[(value // len(_ADJECTIVES)) % len(_NOUNS)]
    return f"{adjective} {noun} #{value % 9000 + 1000}"


def redact_text(text: str) -> str:
    """Remove contact details and demographic statements from resume text."""
    if not text:
        return ""
    text = tx.EMAIL_RE.sub("[email hidden]", text)
    for pattern in tx.PHONE_RES:
        text = pattern.sub("[phone hidden]", text)
    text = tx.LINKEDIN_RE.sub("[linkedin hidden]", text)
    text = tx.GITHUB_RE.sub("[github hidden]", text)
    text = tx.UNIVERSITY_RE.sub("[institution hidden]", text)
    text = _DEMOGRAPHIC_RE.sub("[redacted]", text)
    return text


def _redact_headline(headline: str, payload: dict) -> str | None:
    """Strip the person's own name and any contact detail out of the headline.

    Headlines are extracted from the resume's top line, which routinely carries
    the name and a profile URL along with the job title.
    """
    cleaned = redact_text(headline)

    # Remove every token of the candidate's real name, wherever it appears.
    # No trailing \b for long tokens: PDF extraction glues names onto titles
    # ("KashyapSoftware"), so the name has to be strippable as a prefix too.
    real_name = payload.get("full_name") or ""
    for token in re.split(r"[\s.]+", str(real_name)):
        if not token:
            continue
        if len(token) >= 3:
            cleaned = re.sub(rf"(?<!\w){re.escape(token)}", "", cleaned, flags=re.I)
        else:
            # Initials and one-letter surnames, only as a whole token.
            cleaned = re.sub(rf"(?<!\w){re.escape(token)}(?!\w)", "", cleaned)

    cleaned = re.sub(r"\[[a-z ]+hidden\]", "", cleaned)

    # The stored name can itself be a bad parse, in which case the token removal
    # above misses the real name. So also drop everything before the first word
    # that a job title actually starts with: "Nazar · R · Data Scientist"
    # becomes "Data Scientist" regardless of what the name field says.
    tokens = [t for t in re.split(r"[\s·|,]+", cleaned) if t]
    for index, token in enumerate(tokens):
        if re.sub(r"[^a-z/]", "", token.lower()) in tx.JOB_TITLE_VOCAB:
            cleaned = " ".join(tokens[index:])
            break
    else:
        # No recognisable title word — withhold the headline rather than risk
        # leaking a name through it.
        if len(tokens) <= 4:
            cleaned = ""
    cleaned = re.sub(r"[\s.·|,-]{2,}", " ", cleaned).strip(" .·|,-")
    return cleaned or None


def anonymize_candidate(payload: dict) -> dict:
    """Return a copy of a candidate payload with identifying fields removed.

    Skills, experience, scores and evidence survive — those are the job-relevant
    signals the reviewer is supposed to judge on.
    """
    candidate_id = payload.get("id", 0)
    redacted = dict(payload)

    redacted["full_name"] = alias_for(candidate_id)
    redacted["is_anonymized"] = True
    for field in ("email", "phone", "linkedin_url", "github_url", "portfolio_url"):
        redacted[field] = None
    # University and precise location are strong proxies for background.
    for field in ("university", "location"):
        redacted[field] = None
    if redacted.get("headline"):
        redacted["headline"] = _redact_headline(str(redacted["headline"]), payload)
    if redacted.get("resume_text"):
        redacted["resume_text"] = redact_text(str(redacted["resume_text"]))

    educations = redacted.get("educations")
    if isinstance(educations, list):
        redacted["educations"] = [
            {**entry, "institution": None} if isinstance(entry, dict) else entry
            for entry in educations
        ]

    return redacted


def anonymize_evidence(evidence: list[dict]) -> list[dict]:
    """Scrub identifying details out of score-evidence snippets."""
    scrubbed = []
    for item in evidence or []:
        snippet = item.get("snippet")
        scrubbed.append(
            {**item, "snippet": redact_text(snippet) if snippet else snippet}
        )
    return scrubbed

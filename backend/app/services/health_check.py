"""Resume health check (Tier 3).

Tells a candidate why their resume may be scoring badly *before* a recruiter
silently ranks them last. Each check returns a pass/warn/fail with a concrete
fix, which is what makes the feature useful rather than judgemental.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services.extraction import ExtractedDocument
from app.services.parsing import ParsedResume

PASS, WARN, FAIL = "pass", "warn", "fail"

# Each check contributes its weight to the 0-100 score when it passes,
# half when it warns, nothing when it fails.
_WEIGHTS = {
    "machine_readable": 20,
    "contact": 18,
    "skills": 18,
    "experience": 12,
    "education": 10,
    "sections": 12,
    "length": 6,
    "links": 4,
}


@dataclass
class HealthCheck:
    key: str
    label: str
    status: str
    message: str
    fix: str | None = None


def _status_value(status: str) -> float:
    return {PASS: 1.0, WARN: 0.5, FAIL: 0.0}[status]


def build_report(parsed: ParsedResume, document: ExtractedDocument) -> dict:
    checks: list[HealthCheck] = []

    # 1. Machine readable -----------------------------------------------------
    if document.looks_like_scan:
        checks.append(HealthCheck(
            "machine_readable", "Machine readable", FAIL,
            "Almost no selectable text was found — this looks like a scanned image.",
            "Export your resume directly to PDF from Word or Google Docs instead of scanning a printout.",
        ))
    elif document.word_count < 150:
        checks.append(HealthCheck(
            "machine_readable", "Machine readable", WARN,
            f"Only {document.word_count} words were extracted.",
            "Check that your resume is not built entirely from images or text boxes.",
        ))
    else:
        checks.append(HealthCheck(
            "machine_readable", "Machine readable", PASS,
            f"{document.word_count} words extracted cleanly.",
        ))

    # 2. Contact details ------------------------------------------------------
    missing_contact = [
        label for label, value in
        (("name", parsed.full_name), ("email", parsed.email), ("phone", parsed.phone))
        if not value
    ]
    if not missing_contact:
        checks.append(HealthCheck(
            "contact", "Contact details", PASS, "Name, email and phone all detected."
        ))
    elif len(missing_contact) == 3:
        checks.append(HealthCheck(
            "contact", "Contact details", FAIL,
            "No contact details could be read.",
            "Put your name, email and phone on separate lines at the very top, as plain text.",
        ))
    else:
        checks.append(HealthCheck(
            "contact", "Contact details", WARN,
            f"Could not find your {', '.join(missing_contact)}.",
            "Place each missing detail on its own line in the header, outside any table or text box.",
        ))

    # 3. Skills ---------------------------------------------------------------
    skill_count = len(parsed.skills)
    if skill_count >= 8:
        checks.append(HealthCheck(
            "skills", "Skills", PASS, f"{skill_count} recognised skills found."
        ))
    elif skill_count >= 3:
        checks.append(HealthCheck(
            "skills", "Skills", WARN,
            f"Only {skill_count} recognised skills found.",
            "Add a dedicated Skills section listing your tools and technologies by name.",
        ))
    else:
        checks.append(HealthCheck(
            "skills", "Skills", FAIL,
            "Almost no recognisable skills were found.",
            "Add a Skills section naming the specific languages, frameworks and tools you use.",
        ))

    # 4. Experience -----------------------------------------------------------
    if parsed.total_experience > 0:
        checks.append(HealthCheck(
            "experience", "Experience", PASS,
            f"About {parsed.total_experience:.0f} years of experience detected.",
        ))
    else:
        checks.append(HealthCheck(
            "experience", "Experience", WARN,
            "No total years of experience could be determined.",
            "State it explicitly (e.g. \"4 years of experience\") or use full date ranges like \"Jan 2020 - Present\".",
        ))

    # 5. Education ------------------------------------------------------------
    if parsed.highest_qualification:
        checks.append(HealthCheck(
            "education", "Education", PASS,
            f"Highest qualification detected as {parsed.highest_qualification}.",
        ))
    else:
        checks.append(HealthCheck(
            "education", "Education", WARN,
            "No qualification was detected.",
            "Spell out the degree name, for example \"B.Tech in Computer Science\".",
        ))

    # 6. Standard sections ----------------------------------------------------
    expected = ["experience", "education", "skills"]
    present = [name for name in expected if parsed.sections_found.get(name)]
    missing_sections = [name for name in expected if name not in present]
    if not missing_sections:
        checks.append(HealthCheck(
            "sections", "Standard sections", PASS,
            "Experience, Education and Skills headings all present.",
        ))
    else:
        checks.append(HealthCheck(
            "sections", "Standard sections", WARN if present else FAIL,
            f"Missing heading(s): {', '.join(missing_sections)}.",
            "Use conventional headings — applicant tracking systems look for these exact words.",
        ))

    # 7. Length ---------------------------------------------------------------
    if document.page_count and document.page_count > 4:
        checks.append(HealthCheck(
            "length", "Length", WARN,
            f"{document.page_count} pages is longer than most recruiters read.",
            "Aim for 1-2 pages, or 3 for very senior roles.",
        ))
    else:
        checks.append(HealthCheck("length", "Length", PASS, "Length is reasonable."))

    # 8. Links ----------------------------------------------------------------
    links = [parsed.linkedin_url, parsed.github_url, parsed.portfolio_url]
    if any(links):
        checks.append(HealthCheck(
            "links", "Professional links", PASS,
            f"{sum(1 for link in links if link)} professional link(s) found.",
        ))
    else:
        checks.append(HealthCheck(
            "links", "Professional links", WARN,
            "No LinkedIn, GitHub or portfolio link found.",
            "Add at least a LinkedIn URL as plain text (not hidden behind a hyperlink label).",
        ))

    earned = sum(_WEIGHTS[c.key] * _status_value(c.status) for c in checks)
    total = sum(_WEIGHTS[c.key] for c in checks)
    score = round(100 * earned / total, 1) if total else 0.0

    return {
        "score": score,
        "grade": "Excellent" if score >= 85 else "Good" if score >= 70
        else "Needs work" if score >= 50 else "Poor",
        "checks": [asdict(c) for c in checks],
        "warnings": list(document.warnings),
    }

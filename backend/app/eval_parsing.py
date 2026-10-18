"""Score the resume parser against the committed sample resumes.

    python -m app.eval_parsing

Prints per-field results and exits non-zero on any miss, so CI catches parsing
regressions. See samples/README.md for what this does and does not show.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from app.core.config import BACKEND_DIR
from app.services import parsing
from app.services.extraction import extract_text

SAMPLES = BACKEND_DIR / "samples"


def evaluate() -> list[tuple[str, str, bool, str]]:
    """(resume, field, ok, detail) for every checked field."""
    expected = json.loads((SAMPLES / "expected.json").read_text(encoding="utf-8"))
    rows: list[tuple[str, str, bool, str]] = []
    for filename, truth in expected.items():
        parsed = parsing.parse_resume(extract_text(SAMPLES / "resumes" / filename).text)
        names = {s.name for s in parsed.skills}
        checks = {
            "name": (parsed.full_name == truth["full_name"], parsed.full_name),
            "email": (parsed.email == truth["email"], parsed.email),
            "location": (parsed.location == truth["location"], parsed.location),
            "qualification": (parsed.highest_qualification == truth["qualification"], parsed.highest_qualification),
            "projects": (len(parsed.projects) == truth["projects"], len(parsed.projects)),
            "certifications": (len(parsed.certifications) == truth["certifications"], len(parsed.certifications)),
            "skills": (set(truth["skills"]) <= names, sorted(set(truth["skills"]) - names)),
        }
        if truth["years"] is not None:  # only explicit claims are time-stable
            checks["years"] = (parsed.total_experience == truth["years"], parsed.total_experience)
        rows.extend((filename, field, ok, str(detail)) for field, (ok, detail) in checks.items())
    return rows


def main() -> int:
    rows = evaluate()
    for filename, field, ok, detail in rows:
        if not ok:
            print(f"MISS  {filename:<18} {field:<15} got {detail}")
    passed = sum(ok for _, _, ok, _ in rows)
    print(f"{passed}/{len(rows)} checks passed across {len({r[0] for r in rows})} sample resumes")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())

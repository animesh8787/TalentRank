"""Rule-based, profile-and-role-specific improvement recommendations.

Turns "your score is 72" into "here is what to do about it" by reading the
candidate's actual profile (skill evidence, experience descriptions,
projects, certifications, resume health) and, when a target role is given,
that role's actual scoring explanation from the existing scorer — never
generic advice that could apply to anyone. No separate "AI" call: every
recommendation traces back to a concrete field on the candidate or a
concrete dimension in a real Match.explanation.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models import Candidate, Job

# Weak evidence is the same threshold scoring.py implicitly treats as
# "Basic" proficiency (see parsing.extract_skills), so this recommendation
# lines up with what the skills dimension actually rewards.
WEAK_EVIDENCE_THRESHOLD = 0.55


@dataclass
class Recommendation:
    category: str  # skills | evidence | projects | certifications | experience | education | keywords | resume
    priority: str  # high | medium | low
    title: str
    message: str

    def as_dict(self) -> dict:
        return {
            "category": self.category,
            "priority": self.priority,
            "title": self.title,
            "message": self.message,
        }


def _health_recommendations(candidate: Candidate) -> list[Recommendation]:
    report = candidate.health_report or {}
    recs = []
    for check in report.get("checks", []):
        if check.get("status") in ("warn", "fail") and check.get("fix"):
            recs.append(Recommendation(
                category="resume",
                priority="high" if check["status"] == "fail" else "medium",
                title=check.get("label", "Resume"),
                message=check["fix"],
            ))
    return recs


def _evidence_recommendations(candidate: Candidate, limit: int = 3) -> list[Recommendation]:
    weak = sorted(
        (s for s in candidate.skills if (s.confidence or 0) < WEAK_EVIDENCE_THRESHOLD),
        key=lambda s: s.confidence,
    )
    return [
        Recommendation(
            category="evidence",
            priority="medium",
            title=f"Strengthen evidence for {skill.name}",
            message=(
                f'"{skill.name}" is only weakly evidenced in your resume. Describe a specific '
                "project or task where you used it, instead of just listing it."
            ),
        )
        for skill in weak[:limit]
    ]


def _project_recommendations(candidate: Candidate) -> list[Recommendation]:
    if not candidate.projects:
        return [Recommendation(
            category="projects", priority="medium", title="Add projects",
            message=(
                "Your profile has no projects listed. Adding 2-3 that name the technologies "
                "you used is one of the strongest ways to back up your skills."
            ),
        )]
    undocumented = [p for p in candidate.projects if not (p.technologies or [])]
    if undocumented:
        names = ", ".join(p.name for p in undocumented[:3])
        return [Recommendation(
            category="projects", priority="low", title="List technologies per project",
            message=(
                f"{names} don't list any technologies — add them so recruiters (and this "
                "matcher) know what you actually built them with."
            ),
        )]
    return []


def _certification_recommendations(candidate: Candidate) -> list[Recommendation]:
    if candidate.certifications:
        return []
    return [Recommendation(
        category="certifications", priority="low", title="Add certifications",
        message=(
            "No certifications on file. If you hold any relevant to the roles you're "
            "targeting, add them — they're a quick credibility signal."
        ),
    )]


def _experience_recommendations(candidate: Candidate) -> list[Recommendation]:
    thin = [
        e for e in candidate.experiences
        if len((e.description or "").strip()) < 40
    ]
    if not thin:
        return []
    return [Recommendation(
        category="experience", priority="medium", title="Add detail to your experience",
        message=(
            f"{len(thin)} role(s) on your profile have little or no description. Add 1-2 "
            'sentences per role with a measurable outcome (e.g. "cut API latency by 30%").'
        ),
    )]


def _role_recommendations(candidate: Candidate, job: Job, explanation: dict) -> list[Recommendation]:
    """Recommendations specific to one target role's actual explanation."""
    recs: list[Recommendation] = []
    dims = explanation.get("dimensions") or {}

    missing = explanation.get("missing_skills") or []
    if missing:
        shown = ", ".join(missing[:5])
        recs.append(Recommendation(
            category="skills", priority="high", title="Close the required-skills gap",
            message=(
                f"Adding {shown} to your profile — or evidence of using them — would raise "
                f"your match for {job.title}."
            ),
        ))

    experience_dim = dims.get("experience", {})
    if experience_dim.get("score", 1) < 0.7 and (job.required_experience or 0) > (candidate.total_experience or 0):
        recs.append(Recommendation(
            category="experience", priority="medium",
            title="Experience is below this role's minimum",
            message=(
                f"{job.title} asks for {job.required_experience:.0f}+ years; your profile "
                f"shows {candidate.total_experience:.0f}. Highlighting relevant freelance, "
                "open-source or academic work can partly close this."
            ),
        ))

    education_dim = dims.get("education", {})
    if education_dim.get("score", 1) < 0.7 and job.required_education:
        recs.append(Recommendation(
            category="education", priority="low",
            title="Education below this role's stated minimum",
            message=(
                f"{job.title} lists {job.required_education} as the minimum. If you hold an "
                "equivalent qualification not captured here, add it."
            ),
        ))

    projects_dim = dims.get("projects", {})
    if projects_dim.get("score", 1) < 0.5 and (job.required_skills or []):
        recs.append(Recommendation(
            category="projects", priority="low", title=f"Show {job.title} skills in a project",
            message=(
                "None of your listed projects demonstrate this role's required skills. A "
                "project that explicitly uses them strengthens this match."
            ),
        ))

    semantic_dim = dims.get("semantic", {})
    if semantic_dim.get("score", 1) < 0.5:
        recs.append(Recommendation(
            category="keywords", priority="low", title="Low overall relevance to this role",
            message=(
                f"Your resume's overall wording doesn't closely match {job.title}'s "
                "description. Mirroring some of its language (responsibilities, tools) where "
                "genuinely true can help."
            ),
        ))

    return recs


def build_recommendations(
    candidate: Candidate, job: Job | None = None, explanation: dict | None = None
) -> list[dict]:
    """Actionable, profile-specific recommendations, highest priority first.

    Always includes profile-wide items (resume health, weak skill evidence,
    projects, certifications, experience detail). When `job` and its
    `explanation` (a Match.explanation dict, i.e. real, already-computed
    scoring output) are given, role-specific items from that breakdown are
    added first, since those are the most immediately actionable.
    """
    recs: list[Recommendation] = []
    if job is not None and explanation is not None:
        recs.extend(_role_recommendations(candidate, job, explanation))
    recs.extend(_evidence_recommendations(candidate))
    recs.extend(_project_recommendations(candidate))
    recs.extend(_certification_recommendations(candidate))
    recs.extend(_experience_recommendations(candidate))
    recs.extend(_health_recommendations(candidate))

    order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: order.get(r.priority, 3))
    return [r.as_dict() for r in recs]

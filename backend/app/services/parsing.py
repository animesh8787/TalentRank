"""Structured field extraction from resume text.

Deliberately spaCy-free. The old code called `spacy.load('en_core_web_lg')` in
five places for entity extraction that barely fed the score, and the model was
never installed so every path crashed. Rule-based extraction over a curated
taxonomy plus sentence embeddings for the semantic work gives better results
here without a 560MB model download.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services import taxonomy as tx

# Lines that are clearly not a person's name.
_NAME_STOPWORDS = re.compile(
    r"\b(resume|curriculum|vitae|cv|profile|summary|objective|contact|address|"
    r"phone|email|mobile|linkedin|github|portfolio|www|http)\b",
    re.I,
)
_TITLE_HINT = re.compile(
    r"\b(engineer|developer|scientist|analyst|manager|designer|architect|"
    r"consultant|intern|specialist|lead|director|administrator)\b",
    re.I,
)


@dataclass
class ParsedSkill:
    name: str
    category: str
    confidence: float
    proficiency: str
    evidence: str | None = None


@dataclass
class ParsedExperience:
    company: str | None = None
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None


@dataclass
class ParsedEducation:
    degree: str | None = None
    field_of_study: str | None = None
    institution: str | None = None
    graduation_year: str | None = None


@dataclass
class ParsedResume:
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    headline: str | None = None
    total_experience: float = 0.0
    highest_qualification: str | None = None
    university: str | None = None
    skills: list[ParsedSkill] = field(default_factory=list)
    experiences: list[ParsedExperience] = field(default_factory=list)
    educations: list[ParsedEducation] = field(default_factory=list)
    sections_found: dict[str, bool] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Field extractors
# --------------------------------------------------------------------------- #
def extract_email(text: str) -> str | None:
    match = tx.EMAIL_RE.search(text)
    return match.group(0).lower().rstrip(".,;:") if match else None


def extract_phone(text: str) -> str | None:
    for pattern in tx.PHONE_RES:
        match = pattern.search(text)
        if not match:
            continue
        raw = match.group(0)
        digits = re.sub(r"[^\d+]", "", raw)
        # Reject year ranges and other numeric noise picked up by the loose pattern.
        if 10 <= len(digits.lstrip("+")) <= 15:
            return digits
    return None


def _split_camel(word: str) -> list[str]:
    """Split "AbhishekSenior" -> ["Abhishek", "Senior"].

    PDF text extraction frequently glues a name to the job title that follows
    it on the next visual line, producing exactly this shape.
    """
    return re.findall(r"[A-Z][a-z'\-.]*|[A-Z]+(?![a-z])", word) or [word]


def _name_words(line: str) -> list[str]:
    """Expand a header line into name-candidate words, stopping at a job title.

    Truncating rather than rejecting matters: "Aniket KashyapSoftware Developer"
    must yield "Aniket Kashyap", not nothing.
    """
    words: list[str] = []
    for token in re.split(r"\s+", line):
        for piece in _split_camel(token):
            lowered = piece.lower()
            if (
                _TITLE_HINT.search(piece)
                or _NAME_STOPWORDS.search(piece)
                or lowered in tx.HEADER_NOISE
                or lowered in tx.KNOWN_LOCATIONS
            ):
                return words
            words.append(piece)
    return words


def extract_name(text: str, email: str | None = None) -> str | None:
    """Take the first plausible person-name line from the resume header."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    for line in lines[:8]:
        if len(line) > 80 or _NAME_STOPWORDS.search(line):
            continue
        if any(char.isdigit() for char in line) or "@" in line:
            continue
        words = _name_words(line)
        if not 1 < len(words) <= 4:
            continue
        # Reject single-letter fragments left behind by PDF column extraction.
        if sum(len(w) > 1 for w in words) < 2:
            continue
        # Accept Title Case or ALL CAPS, allowing initials and hyphenated names.
        if all(re.fullmatch(r"[A-Z][a-zA-Z'\-.]*", w) or w.isupper() for w in words):
            return " ".join(words).title()[:255]

    # Some extractors flatten the whole resume onto one line, so try the leading
    # words of the document before giving up on in-document detection.
    leading = re.split(r"\s+", text.strip())[:6]
    run: list[str] = []
    for word in leading:
        is_namelike = (
            re.fullmatch(r"[A-Z][a-zA-Z'\-.]{1,20}", word)
            and not _TITLE_HINT.search(word)
            and word.lower() not in tx.HEADER_NOISE
            and word.lower() not in tx.KNOWN_LOCATIONS
        )
        if is_namelike:
            run.append(word)
            if len(run) == 3:
                break
        elif run:
            break
    if len(run) >= 2:
        return " ".join(run).title()[:255]

    # Fall back to the local part of the email: "john.doe@x.com" -> "John Doe"
    if email:
        local = email.split("@", 1)[0]
        parts = [p for p in re.split(r"[._\-0-9]+", local) if len(p) > 1]
        if parts:
            return " ".join(p.capitalize() for p in parts)[:255]
    return None


def extract_headline(text: str) -> str | None:
    """The job-title line that usually sits under the name."""
    for line in [ln.strip() for ln in text.split("\n") if ln.strip()][:6]:
        if _TITLE_HINT.search(line) and len(line) <= 90:
            return line[:512]
    return None


def extract_links(text: str) -> tuple[str | None, str | None, str | None]:
    """Return (linkedin, github, portfolio)."""

    def _clean(value: str) -> str:
        value = value.rstrip("/.,;:")
        return value if value.startswith("http") else f"https://{value}"

    linkedin = tx.LINKEDIN_RE.search(text)
    github = tx.GITHUB_RE.search(text)

    portfolio = None
    for candidate in tx.URL_RE.findall(text):
        lowered = candidate.lower()
        if any(host in lowered for host in ("linkedin.com", "github.com")):
            continue
        portfolio = _clean(candidate)
        break

    return (
        _clean(linkedin.group(0)) if linkedin else None,
        _clean(github.group(0)) if github else None,
        portfolio,
    )


def extract_location(text: str, name: str | None = None) -> str | None:
    # Gazetteer first. Header lines often read "Bengaluru | 99xxxxxxx | me@mail".
    # Matching known cities beats accepting any capitalised token, which used to
    # promote section headings ("Summary", "May") into the location field.
    head = "\n".join([ln for ln in text.split("\n") if ln.strip()][:12])
    best: str | None = None
    for city in tx.KNOWN_LOCATIONS:
        if re.search(rf"(?<![\w]){re.escape(city)}(?![\w])", head, re.I):
            if best is None or len(city) > len(best):
                best = city
    if best:
        return best.title()[:255]

    # Then an explicitly labelled field. Horizontal whitespace only, so the
    # match cannot run past the line and swallow the next field.
    labelled = re.search(
        r"(?:location|address|based[ \t]+in|residing[ \t]+in|city)[ \t]*[:\-][ \t]*"
        r"([A-Za-z][A-Za-z ,.'\-]{2,60})",
        text,
        re.I,
    )
    if labelled:
        value = labelled.group(1).strip().rstrip(",.-")
        words = [w for w in re.split(r"[\s,]+", value) if w]
        # Street addresses ("Flat No A, 2nd Cross") are not a usable location.
        looks_like_street = bool(
            re.match(r"^(flat|no\.?|house|plot|door|room|block|street|road)\b", value, re.I)
        )
        if 0 < len(words) <= 3 and not looks_like_street and value.lower() not in tx.HEADER_NOISE:
            return value.title()[:255]

    # Finally, a whole-document scan for the same gazetteer.
    for city in sorted(tx.KNOWN_LOCATIONS, key=len, reverse=True):
        if re.search(rf"(?<![\w]){re.escape(city)}(?![\w])", text, re.I):
            return city.title()[:255]
    return None


def _sentence_for(text: str, term: str) -> str | None:
    """Find the sentence containing `term` — used as score evidence."""
    pattern = re.compile(
        rf"[^.\n]*\b{re.escape(term)}\b[^.\n]*", re.I
    )
    match = pattern.search(text)
    if not match:
        return None
    snippet = " ".join(match.group(0).split())
    if len(snippet) > 240:
        snippet = snippet[:237] + "..."
    return snippet or None


def extract_skills(text: str) -> list[ParsedSkill]:
    """Match the taxonomy against the resume, keeping evidence for each hit."""
    lowered = text.lower()
    found: dict[str, ParsedSkill] = {}

    for skill in tx.ALL_SKILLS:
        # Word-boundary match, but skills like "c++" and "node.js" need escaping
        # and a boundary that tolerates trailing punctuation.
        pattern = re.compile(rf"(?<![\w+#.]){re.escape(skill)}(?![\w+#])", re.I)
        matches = pattern.findall(lowered)
        if not matches:
            continue

        occurrences = len(matches)
        evidence = _sentence_for(text, skill)

        # Confidence: repeated mentions and explicit proficiency wording both help.
        confidence = 0.45 + min(occurrences, 4) * 0.08
        if evidence:
            context = evidence.lower()
            if re.search(r"\b(expert|advanced|proficient|extensive|specialist)\b", context):
                confidence += 0.25
            elif re.search(r"\b(experienced|strong|solid|hands[- ]on)\b", context):
                confidence += 0.15
            elif re.search(r"\b(familiar|basic|beginner|exposure|knowledge of)\b", context):
                confidence -= 0.10
        confidence = round(max(0.1, min(confidence, 1.0)), 3)

        if confidence >= 0.75:
            proficiency = "Expert"
        elif confidence >= 0.55:
            proficiency = "Intermediate"
        else:
            proficiency = "Basic"

        found[skill] = ParsedSkill(
            name=skill,
            category=tx.SKILL_TO_CATEGORY.get(skill, "other"),
            confidence=confidence,
            proficiency=proficiency,
            evidence=evidence,
        )

    # Drop substrings shadowed by a longer match ("sql" inside "postgresql").
    names = set(found)
    for name in list(names):
        if any(name != other and name in other for other in names):
            longer_present = any(
                name != other and name in other and other in found for other in names
            )
            if longer_present and len(name) <= 4:
                found.pop(name, None)

    return sorted(found.values(), key=lambda s: (-s.confidence, s.name))


def extract_total_experience(text: str) -> float:
    """Years of experience: prefer an explicit claim, else infer from dates."""
    explicit = [int(m) for m in tx.EXPERIENCE_RE.findall(text) if m.isdigit()]
    if explicit:
        return float(min(max(explicit), 50))

    years: list[int] = []
    for match in tx.DATE_RANGE_RE.finditer(text):
        span = match.group(0)
        found_years = [int(y) for y in re.findall(r"(?:19|20)\d{2}", span)]
        years.extend(found_years)
        if re.search(r"present|current|now", span, re.I):
            from datetime import datetime

            years.append(datetime.now().year)

    if len(years) >= 2:
        span = max(years) - min(years)
        if 0 < span <= 50:
            return float(span)
    return 0.0


def extract_education(text: str) -> tuple[list[ParsedEducation], str | None, str | None]:
    """Return (entries, highest qualification label, primary institution)."""
    entries: list[ParsedEducation] = []
    institutions = tx.UNIVERSITY_RE.findall(text)
    primary_institution = institutions[0].strip() if institutions else None

    best_rank = 0
    for keyword, level in tx.EDUCATION_LEVELS.items():
        if not re.search(rf"\b{re.escape(keyword)}\b", text, re.I):
            continue
        best_rank = max(best_rank, level)
        sentence = _sentence_for(text, keyword)
        year = None
        if sentence:
            year_match = re.search(r"(19|20)\d{2}", sentence)
            year = year_match.group(0) if year_match else None
        institution = None
        if sentence:
            found = tx.UNIVERSITY_RE.search(sentence)
            institution = found.group(1).strip() if found else None
        entries.append(
            ParsedEducation(
                degree=tx.EDUCATION_LABELS.get(level),
                field_of_study=None,
                institution=institution or primary_institution,
                graduation_year=year,
            )
        )

    # Collapse duplicates of the same degree level, keeping the richest entry.
    unique: dict[str, ParsedEducation] = {}
    for entry in entries:
        key = entry.degree or "Unspecified"
        existing = unique.get(key)
        if existing is None or (entry.institution and not existing.institution):
            unique[key] = entry

    return list(unique.values()), tx.EDUCATION_LABELS.get(best_rank), primary_institution


def extract_experiences(text: str) -> list[ParsedExperience]:
    """Pull work-history rows from date-range lines."""
    experiences: list[ParsedExperience] = []
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    for index, line in enumerate(lines):
        match = tx.DATE_RANGE_RE.search(line)
        if not match:
            continue
        years = re.findall(r"(?:19|20)\d{2}", match.group(0))
        end_raw = match.group(4) or ""
        end = "Present" if re.search(r"present|current|now", end_raw, re.I) else (
            years[1] if len(years) > 1 else None
        )

        # The company/title usually sits on the same line or the next one.
        context = " ".join(lines[index : index + 2])
        context = tx.DATE_RANGE_RE.sub("", context).strip(" |-–—,")
        parts = [p.strip() for p in re.split(r"[|,–—-]{1,2}", context) if p.strip()]

        experiences.append(
            ParsedExperience(
                title=parts[0][:255] if parts else None,
                company=parts[1][:255] if len(parts) > 1 else None,
                start_date=years[0] if years else None,
                end_date=end,
                description=None,
            )
        )
        if len(experiences) >= 12:
            break
    return experiences


def detect_sections(text: str) -> dict[str, bool]:
    return {name: bool(pattern.search(text)) for name, pattern in tx.SECTION_HEADINGS.items()}


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def parse_resume(text: str) -> ParsedResume:
    email = extract_email(text)
    linkedin, github, portfolio = extract_links(text)
    educations, highest, university = extract_education(text)
    full_name = extract_name(text, email)

    return ParsedResume(
        full_name=full_name,
        email=email,
        phone=extract_phone(text),
        location=extract_location(text, full_name),
        linkedin_url=linkedin,
        github_url=github,
        portfolio_url=portfolio,
        headline=extract_headline(text),
        total_experience=extract_total_experience(text),
        highest_qualification=highest,
        university=university,
        skills=extract_skills(text),
        experiences=extract_experiences(text),
        educations=educations,
        sections_found=detect_sections(text),
    )

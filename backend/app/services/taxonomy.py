"""Skill taxonomy, aliases and regex patterns.

Consolidates the three divergent keyword lists that used to live in
preprocessing/models/patterns.py, preprocessing/dataextraction.py and
preprocessing/processors/resume_processor.py into one place.
"""
from __future__ import annotations

import re

SKILL_CATEGORIES: dict[str, list[str]] = {
    "programming": [
        "python", "java", "javascript", "typescript", "c++", "c#", "c",
        "ruby", "php", "swift", "kotlin", "go", "rust", "scala", "perl",
        "r", "matlab", "dart", "objective-c", "bash", "powershell",
    ],
    "web": [
        "html", "css", "sass", "tailwind", "bootstrap", "react", "angular",
        "vue", "svelte", "next.js", "nuxt", "node.js", "express", "django",
        "flask", "fastapi", "spring", "spring boot", "asp.net", "laravel",
        "jquery", "graphql", "rest api", "websocket",
    ],
    "databases": [
        "sql", "mysql", "postgresql", "mongodb", "oracle", "sqlite", "redis",
        "cassandra", "elasticsearch", "dynamodb", "neo4j", "snowflake",
        "bigquery", "clickhouse",
    ],
    "cloud": [
        "aws", "azure", "gcp", "google cloud", "heroku", "digitalocean",
        "lambda", "s3", "ec2", "cloudformation", "firebase",
    ],
    "devops": [
        "docker", "kubernetes", "jenkins", "git", "github", "gitlab",
        "ansible", "terraform", "puppet", "chef", "prometheus", "grafana",
        "ci/cd", "github actions", "nginx", "linux",
    ],
    "data_science": [
        "machine learning", "deep learning", "data analysis", "data mining",
        "statistics", "pandas", "numpy", "scikit-learn", "tensorflow",
        "pytorch", "keras", "spark", "hadoop", "hive", "tableau", "power bi",
        "nlp", "natural language processing", "computer vision", "llm",
        "transformers", "xgboost", "matplotlib", "seaborn", "airflow",
        "etl", "data engineering", "a/b testing",
    ],
    "mobile": [
        "android", "ios", "react native", "flutter", "swiftui", "jetpack compose",
    ],
    "practices": [
        "agile", "scrum", "kanban", "project management", "tdd",
        "microservices", "system design", "code review", "unit testing",
    ],
}

# Flat lookup: canonical skill -> category
SKILL_TO_CATEGORY: dict[str, str] = {
    skill: category
    for category, skills in SKILL_CATEGORIES.items()
    for skill in skills
}

ALL_SKILLS: list[str] = sorted(SKILL_TO_CATEGORY, key=len, reverse=True)

# Common shorthands recruiters and candidates actually type.
SKILL_ALIASES: dict[str, str] = {
    "ml": "machine learning",
    "dl": "deep learning",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "reactjs": "react", "react.js": "react",
    "nodejs": "node.js", "node": "node.js",
    "vuejs": "vue", "vue.js": "vue",
    "postgres": "postgresql",
    "k8s": "kubernetes",
    "gcloud": "gcp", "google cloud platform": "gcp",
    "amazon web services": "aws",
    "sklearn": "scikit-learn", "scikit learn": "scikit-learn",
    "tf": "tensorflow",
    "cv": "computer vision",
    "natural language processing": "nlp",
    "ms sql": "sql", "sql server": "sql", "t-sql": "sql", "plsql": "sql",
    "dotnet": "asp.net", ".net": "asp.net",
    "golang": "go",
    "cicd": "ci/cd", "ci cd": "ci/cd",
}

EDUCATION_LEVELS: dict[str, int] = {
    "high school": 1, "diploma": 2, "associate": 2,
    "bachelor": 3, "bachelors": 3, "b.tech": 3, "btech": 3, "b.e": 3,
    "be": 3, "b.sc": 3, "bsc": 3, "b.com": 3, "bca": 3, "b.a": 3,
    "master": 4, "masters": 4, "m.tech": 4, "mtech": 4, "m.e": 4,
    "m.sc": 4, "msc": 4, "m.com": 4, "mca": 4, "mba": 4, "m.a": 4,
    "phd": 5, "ph.d": 5, "doctorate": 5, "postdoc": 5,
}

EDUCATION_LABELS: dict[int, str] = {
    0: "Unspecified", 1: "High School", 2: "Diploma / Associate",
    3: "Bachelors", 4: "Masters", 5: "PhD",
}

# --------------------------------------------------------------------------- #
# Regex patterns
# --------------------------------------------------------------------------- #
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Ordered most-specific first so a +country-code number is not truncated.
PHONE_RES = [
    re.compile(r"\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}"),
    re.compile(r"\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"),
    re.compile(r"\b\d{10}\b"),
]

LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-%.]+/?", re.I)
GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[\w\-.]+/?", re.I)
URL_RE = re.compile(r"https?://[^\s,;)\]]+")

# "5 years of experience", "5+ yrs experience"
EXPERIENCE_RE = re.compile(
    r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:relevant\s*|professional\s*|total\s*)?experience",
    re.I,
)

# Date ranges like "Jan 2019 - Present" or "2019 - 2022"
DATE_RANGE_RE = re.compile(
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?"
    r"(19|20)\d{2}\s*(?:-|–|—|to)\s*"
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?"
    r"((19|20)\d{2}|present|current|now)",
    re.I,
)

SECTION_HEADINGS: dict[str, re.Pattern] = {
    "summary": re.compile(r"^\s*(professional\s+)?(summary|profile|objective|about)\b", re.I | re.M),
    "experience": re.compile(r"^\s*(work\s+|professional\s+|employment\s+)?experience\b|^\s*employment\s+history\b", re.I | re.M),
    "education": re.compile(r"^\s*(education|academic|qualifications?|educational\s+credentials)\b", re.I | re.M),
    "skills": re.compile(r"^\s*((technical|key|core|programming)\s+)?skills\b|^\s*technologies\b", re.I | re.M),
    "projects": re.compile(r"^\s*(projects?|assignments?|portfolio)\b", re.I | re.M),
    "certifications": re.compile(r"^\s*(certifications?|licenses?|courses?)\b", re.I | re.M),
}

# Up to four capitalised words immediately preceding the institution keyword.
# A looser "any characters" version swallowed whole sentences of surrounding text.
# Horizontal whitespace only ([ \t], never \n) so a match cannot run across
# lines and swallow the following section heading.
UNIVERSITY_RE = re.compile(
    r"((?:[A-Z][\w&.'\-]*[ \t]+){0,4}"
    r"(?:University|College|Institute of Technology|Institute|Polytechnic|Academy)"
    r"(?:[ \t]+of[ \t]+(?:[A-Z][\w&.'\-]*[ \t]*){1,3})?)"
)

# Words that appear in resume headers but are never a person's name or a city.
# Without this, section headings get promoted into the name/location fields.
HEADER_NOISE = {
    "resume", "curriculum", "vitae", "profile", "summary", "objective",
    "contact", "details", "personal", "information", "about", "me",
    "experience", "education", "skills", "projects", "certifications",
    "career", "professional", "work", "history", "data", "science",
    "scientist", "engineer", "developer", "analyst", "manager", "senior",
    "junior", "lead", "email", "mail", "phone", "mobile", "address",
    "linkedin", "github", "portfolio", "state", "city", "country",
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct",
    "nov", "dec", "present", "current", "no", "yes", "com", "www",
    # Job-title fragments that PDF extraction glues onto the end of a name
    "software", "technology", "technical", "consultant", "architect",
    "specialist", "intern", "director", "administrator", "associate",
    "principal", "staff", "head", "officer", "executive", "analytics",
    "machine", "learning", "full", "stack", "frontend", "backend", "sr",
    "jr", "team", "project", "product", "business", "systems", "solutions",
    # Countries — a "City Country" header line is a location, not a name
    "india", "usa", "us", "uk", "america", "canada", "germany", "france",
    "australia", "singapore", "japan", "china", "brazil", "spain", "italy",
    "netherlands", "ireland", "poland", "sweden", "norway", "denmark",
    "switzerland", "uae", "emirates", "qatar", "israel", "mexico",
}

# City gazetteer for location detection. A capitalised-token heuristic alone
# promoted section headings ("Summary", "May") into the location field.
KNOWN_LOCATIONS = {
    # India
    "bangalore", "bengaluru", "mumbai", "bombay", "delhi", "new delhi",
    "noida", "gurgaon", "gurugram", "hyderabad", "chennai", "madras",
    "pune", "kolkata", "calcutta", "ahmedabad", "jaipur", "lucknow",
    "chandigarh", "indore", "bhopal", "nagpur", "coimbatore", "kochi",
    "cochin", "thiruvananthapuram", "trivandrum", "mysore", "mysuru",
    "vizag", "visakhapatnam", "bhubaneswar", "surat", "vadodara", "nashik",
    "raipur", "ranchi", "patna", "guwahati", "dehradun", "mangalore",
    "ncr", "delhi ncr", "navi mumbai", "thane",
    # Global hubs
    "london", "manchester", "dublin", "berlin", "munich", "hamburg",
    "frankfurt", "paris", "amsterdam", "rotterdam", "zurich", "geneva",
    "stockholm", "copenhagen", "oslo", "helsinki", "madrid", "barcelona",
    "lisbon", "milan", "rome", "warsaw", "prague", "vienna", "budapest",
    "new york", "brooklyn", "san francisco", "san jose", "palo alto",
    "mountain view", "seattle", "boston", "austin", "chicago", "denver",
    "los angeles", "san diego", "atlanta", "dallas", "houston", "miami",
    "toronto", "vancouver", "montreal", "ottawa", "calgary",
    "sydney", "melbourne", "brisbane", "perth", "auckland", "wellington",
    "singapore", "hong kong", "tokyo", "osaka", "seoul", "shanghai",
    "beijing", "shenzhen", "taipei", "bangkok", "jakarta", "manila",
    "kuala lumpur", "dubai", "abu dhabi", "doha", "riyadh", "tel aviv",
    "cairo", "nairobi", "lagos", "johannesburg", "cape town",
    "sao paulo", "rio de janeiro", "buenos aires", "mexico city",
    "remote", "hybrid",
}

# Words a job title legitimately starts with. Used by blind review to find where
# the title begins, so anything before it (which is almost always the person's
# name) can be dropped — without depending on the name having parsed correctly.
JOB_TITLE_VOCAB = {
    "senior", "junior", "lead", "principal", "staff", "chief", "head",
    "associate", "assistant", "sr", "jr", "trainee", "intern", "graduate",
    "software", "data", "machine", "deep", "full", "fullstack", "front",
    "frontend", "back", "backend", "web", "mobile", "cloud", "devops", "site",
    "systems", "system", "network", "security", "quality", "test",
    "business", "product", "project", "program", "technical", "technology",
    "solution", "solutions", "research", "applied", "analytics", "analytic",
    "engineer", "engineering", "developer", "scientist", "analyst", "manager",
    "designer", "architect", "consultant", "specialist", "director", "officer",
    "executive", "administrator", "programmer", "developer/data", "lead/",
    "professional", "expert", "practitioner", "strategist", "advisor",
}

# Terms that can carry demographic signal, stripped in anonymised review mode.
DEMOGRAPHIC_TERMS = [
    "male", "female", "man", "woman", "he/him", "she/her", "they/them",
    "married", "single", "unmarried", "divorced", "widowed",
    "date of birth", "dob", "birthday", "age", "nationality",
    "religion", "caste", "gender", "sex", "marital status",
    "father's name", "mother's name", "spouse", "photograph", "photo",
]


def canonical_skill(raw: str) -> str:
    """Normalise a user-typed skill to its canonical taxonomy form."""
    cleaned = raw.strip().lower().rstrip(".,;:")
    return SKILL_ALIASES.get(cleaned, cleaned)


def education_rank(text: str | None) -> int:
    """Map a free-text qualification to an ordinal level (0 = unknown)."""
    if not text:
        return 0
    lowered = text.lower()
    best = 0
    for keyword, level in EDUCATION_LEVELS.items():
        if re.search(rf"\b{re.escape(keyword)}\b", lowered):
            best = max(best, level)
    return best

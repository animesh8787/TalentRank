# Common resume section patterns
SECTION_PATTERNS = {
    'experience': r'(work|employment|experience) history?',
    'education': r'educations?|degrees?|academics?',
    'skills': r'(technical|key)?\s*skills?',
    'projects': r'projects?|assignments?'
}

# Enhanced skill keywords list
SKILL_KEYWORDS = [
    # Programming
    'python', 'java', 'c++', 'c#', 'javascript', 'typescript',
    'ruby', 'php', 'swift', 'kotlin', 'go', 'rust',
    
    # Web
    'html', 'css', 'react', 'angular', 'vue', 'django', 'flask',
    'node.js', 'express', 'spring', 'laravel',
    
    # Databases
    'sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'redis',
    
    # Data Science
    'machine learning', 'deep learning', 'tensorflow', 'pytorch',
    'data analysis', 'pandas', 'numpy', 'spark', 'hadoop',
    
    # DevOps
    'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd',
    'terraform', 'ansible', 'jenkins',
    
    # Other
    'project management', 'agile', 'scrum', 'git', 'linux'
]

# Contact info patterns
CONTACT_PATTERNS = {
    'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
    'phone': r'(\+\d{1,3}[-\.\s]?)?(\(\d{3}\)|\d{3})[-\.\s]?\d{3}[-\.\s]?\d{4}',
    'url': r'https?://[^\s]+'
}

# Date patterns for education/experience
DATE_PATTERNS = {
    'year_range': r'(20\d{2}\s*[-–]\s*20\d{2}|present|current)',
    'month_year': r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d{2}'
} 
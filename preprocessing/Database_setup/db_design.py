from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, Text, Enum, Date, DateTime, Boolean
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
from sqlalchemy.schema import CreateTable

Base = declarative_base()

# Job-Description-Table
class JobDescription(Base):
    __tablename__ = 'job_descriptions'
    job_id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(Text, nullable=False)
    required_experience = Column(Float, nullable=False)
    required_education = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    salary_range = Column(String(255))
    posted_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default='Active')
    
    # Relationships
    matches = relationship("JobMatch", back_populates="job", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="job", cascade="all, delete-orphan")

# Job-Match-Table
class JobMatch(Base):
    __tablename__ = 'job_matches'
    match_id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey('job_descriptions.job_id'))
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    match_score = Column(Float, nullable=False)
    skill_match_percentage = Column(Float, nullable=False)
    experience_match_percentage = Column(Float, nullable=False)
    education_match_percentage = Column(Float, nullable=False)
    text_similarity = Column(Float)
    location_match = Column(Boolean)
    match_details = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(String(20), default='New')
    notes = Column(Text)
    
    # Relationships
    job = relationship("JobDescription", back_populates="matches")
    candidate = relationship("Candidate", back_populates="job_matches")
    history = relationship("MatchHistory", back_populates="match", cascade="all, delete-orphan")

# Match-History-Table
class MatchHistory(Base):
    __tablename__ = 'match_history'
    history_id = Column(Integer, primary_key=True, autoincrement=True)
    match_id = Column(Integer, ForeignKey('job_matches.match_id'))
    status_change = Column(String(20))
    changed_at = Column(DateTime, default=datetime.utcnow)
    changed_by = Column(String(255))
    notes = Column(Text)
    
    # Relationships
    match = relationship("JobMatch", back_populates="history")

# Candidates-Table
class Candidate(Base):
    __tablename__ = 'candidates'
    candidate_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255))
    email = Column(String(255), unique=True)
    phone = Column(String(20))
    linkedin = Column(String(255))
    github = Column(String(255))
    total_experience = Column(Float)
    highest_qualification = Column(String(255))
    university = Column(String(255))
    location = Column(String(255))
    resume_text = Column(Text)

    # Relationships
    skills = relationship("Skill", back_populates="candidate", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="candidate", cascade="all, delete-orphan")
    experiences = relationship("WorkExperience", back_populates="candidate", cascade="all, delete-orphan")
    certifications = relationship("Certification", back_populates="candidate", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="candidate", cascade="all, delete-orphan")
    job_matches = relationship("JobMatch", back_populates="candidate", cascade="all, delete-orphan")
    analysis_results = relationship("AnalysisResults", back_populates="candidate", cascade="all, delete-orphan")

# Skills-Table
class Skill(Base):
    __tablename__ = 'skills'
    skill_id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    skill_name = Column(String(255))
    proficiency_level = Column(String(12))

    candidate = relationship("Candidate", back_populates="skills")

# Projects-Table
class Project(Base):
    __tablename__ = 'projects'
    project_id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    project_title = Column(String(255))
    project_description = Column(Text)
    technologies_used = Column(Text)
    project_url = Column(String(255))

    candidate = relationship("Candidate", back_populates="projects")

# Work-Experience-Table
class WorkExperience(Base):
    __tablename__ = 'work_experience'
    work_id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    company_name = Column(String(255))
    job_title = Column(String(255))
    start_date = Column(Date)
    end_date = Column(Date)
    description = Column(Text)

    candidate = relationship("Candidate", back_populates="experiences")

# Certifications-Table
class Certification(Base):
    __tablename__ = 'certifications'
    cert_id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    certification_name = Column(String(255))
    issuing_organization = Column(String(255))
    issue_date = Column(Date)
    expiration_date = Column(Date)
    credential_url = Column(String(255))

    candidate = relationship("Candidate", back_populates="certifications")

# Rankings-Table
class Ranking(Base):
    __tablename__ = 'rankings'
    ranking_id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    job_id = Column(Integer, ForeignKey('job_descriptions.job_id'))
    skill_score = Column(Float)
    experience_score = Column(Float)
    education_score = Column(Float)
    text_similarity_score = Column(Float)
    location_score = Column(Float)
    overall_score = Column(Float)
    skill_matches = Column(Text)
    missing_skills = Column(Text)
    match_date = Column(DateTime, default=datetime.utcnow)
    match_status = Column(String(20), default='Pending')

    candidate = relationship("Candidate", back_populates="rankings")
    job = relationship("JobDescription", back_populates="rankings")

# Analysis-Results-Table
class AnalysisResults(Base):
    __tablename__ = 'analysis_results'
    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, ForeignKey('candidates.candidate_id'))
    analysis_date = Column(DateTime, default=datetime.utcnow)
    insights = Column(Text)

    candidate = relationship("Candidate", back_populates="analysis_results")

def create_all_tables():
    """Create all tables in the database"""
    DATABASE_URL = "mysql+pymysql://root:123456@localhost:3306/resume_db"
    engine = create_engine(DATABASE_URL)
    
    try:
        Base.metadata.create_all(engine)
        print("Successfully created all tables")
    except Exception as e:
        print(f"Error creating tables: {str(e)}")

if __name__ == '__main__':
    create_all_tables()

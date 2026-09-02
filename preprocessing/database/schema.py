from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class Candidate(Base):
    __tablename__ = 'candidates'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    email = Column(String(100))
    phone = Column(String(20))
    linkedin = Column(String(200))
    github = Column(String(200))
    total_experience = Column(String(50))
    highest_qualification = Column(String(100))
    university = Column(String(200))
    location = Column(String(100))
    resume_text = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    skills = relationship("Skill", back_populates="candidate")
    projects = relationship("Project", back_populates="candidate")
    work_experience = relationship("WorkExperience", back_populates="candidate")
    certifications = relationship("Certification", back_populates="candidate")
    analysis_results = relationship("AnalysisResult", back_populates="candidate")

class Skill(Base):
    __tablename__ = 'skills'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    skill_name = Column(String(100))
    proficiency_level = Column(String(50))
    
    candidate = relationship("Candidate", back_populates="skills")

class Project(Base):
    __tablename__ = 'projects'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    project_title = Column(String(200))
    project_description = Column(Text)
    technologies_used = Column(Text)
    project_url = Column(String(200))
    
    candidate = relationship("Candidate", back_populates="projects")

class WorkExperience(Base):
    __tablename__ = 'work_experience'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    company_name = Column(String(200))
    job_title = Column(String(200))
    start_date = Column(String(50))
    end_date = Column(String(50))
    description = Column(Text)
    
    candidate = relationship("Candidate", back_populates="work_experience")

class Certification(Base):
    __tablename__ = 'certifications'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    certification_name = Column(String(200))
    issuing_organization = Column(String(200))
    issue_date = Column(String(50))
    expiration_date = Column(String(50))
    credential_url = Column(String(200))
    
    candidate = relationship("Candidate", back_populates="certifications")

class AnalysisResult(Base):
    __tablename__ = 'analysis_results'
    
    id = Column(Integer, primary_key=True)
    candidate_id = Column(Integer, ForeignKey('candidates.id'))
    analysis_date = Column(DateTime, default=datetime.utcnow)
    insights = Column(JSON)
    
    candidate = relationship("Candidate", back_populates="analysis_results") 
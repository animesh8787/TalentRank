from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .schema import (
    Base, Candidate, Skill, Project, WorkExperience,
    Certification, AnalysisResult
)
from ..utils.text_utils import setup_logger
import datetime

class DatabaseManager:
    def __init__(self, db_url: str):
        self.engine = create_engine(db_url)
        self.Session = sessionmaker(bind=self.engine)
        self.logger = setup_logger(__name__)
        
    def create_tables(self):
        """Create all database tables"""
        Base.metadata.create_all(self.engine)
        
    def insert_candidate_data(self, extracted_data: dict) -> int:
        """
        Insert extracted resume data into the database
        
        Args:
            extracted_data: Dictionary containing all extracted resume data
            
        Returns:
            int: ID of the created candidate record
        """
        session = self.Session()
        try:
            # Create candidate record
            candidate = Candidate(
                name=extracted_data.get('name'),
                email=extracted_data.get('email'),
                phone=extracted_data.get('phone'),
                linkedin=extracted_data.get('linkedin'),
                github=extracted_data.get('github'),
                total_experience=extracted_data.get('total_experience'),
                highest_qualification=extracted_data.get('highest_qualification'),
                university=extracted_data.get('university'),
                location=extracted_data.get('location'),
                resume_text=extracted_data.get('resume_text')
            )
            session.add(candidate)
            session.flush()  # Get the candidate ID
            
            # Insert skills
            for skill_data in extracted_data.get('skills', []):
                skill = Skill(
                    candidate_id=candidate.id,
                    skill_name=skill_data.get('name'),
                    proficiency_level=skill_data.get('proficiency')
                )
                session.add(skill)
            
            # Insert projects
            for project_data in extracted_data.get('projects', []):
                project = Project(
                    candidate_id=candidate.id,
                    project_title=project_data.get('title'),
                    project_description=project_data.get('description'),
                    technologies_used=project_data.get('technologies'),
                    project_url=project_data.get('url')
                )
                session.add(project)
            
            # Insert work experience
            for exp_data in extracted_data.get('work_experience', []):
                experience = WorkExperience(
                    candidate_id=candidate.id,
                    company_name=exp_data.get('company'),
                    job_title=exp_data.get('title'),
                    start_date=exp_data.get('start_date'),
                    end_date=exp_data.get('end_date'),
                    description=exp_data.get('description')
                )
                session.add(experience)
            
            # Insert certifications
            for cert_data in extracted_data.get('certifications', []):
                certification = Certification(
                    candidate_id=candidate.id,
                    certification_name=cert_data.get('name'),
                    issuing_organization=cert_data.get('organization'),
                    issue_date=cert_data.get('issue_date'),
                    expiration_date=cert_data.get('expiration_date'),
                    credential_url=cert_data.get('url')
                )
                session.add(certification)
            
            # Insert analysis results
            analysis = AnalysisResult(
                candidate_id=candidate.id,
                insights=extracted_data.get('analysis_insights', {})
            )
            session.add(analysis)
            
            session.commit()
            return candidate.id
            
        except Exception as e:
            session.rollback()
            self.logger.error(f"Error inserting candidate data: {str(e)}")
            raise
        finally:
            session.close()
            
    def get_candidate_data(self, candidate_id: int) -> dict:
        """
        Retrieve all data for a candidate
        
        Args:
            candidate_id: ID of the candidate
            
        Returns:
            dict: Complete candidate data
        """
        session = self.Session()
        try:
            candidate = session.query(Candidate).filter_by(id=candidate_id).first()
            if not candidate:
                return None
                
            return {
                'basic_info': {
                    'name': candidate.name,
                    'email': candidate.email,
                    'phone': candidate.phone,
                    'linkedin': candidate.linkedin,
                    'github': candidate.github,
                    'total_experience': candidate.total_experience,
                    'highest_qualification': candidate.highest_qualification,
                    'university': candidate.university,
                    'location': candidate.location,
                    'resume_text': candidate.resume_text
                },
                'skills': [
                    {'name': s.skill_name, 'proficiency': s.proficiency_level}
                    for s in candidate.skills
                ],
                'projects': [
                    {
                        'title': p.project_title,
                        'description': p.project_description,
                        'technologies': p.technologies_used,
                        'url': p.project_url
                    }
                    for p in candidate.projects
                ],
                'work_experience': [
                    {
                        'company': w.company_name,
                        'title': w.job_title,
                        'start_date': w.start_date,
                        'end_date': w.end_date,
                        'description': w.description
                    }
                    for w in candidate.work_experience
                ],
                'certifications': [
                    {
                        'name': c.certification_name,
                        'organization': c.issuing_organization,
                        'issue_date': c.issue_date,
                        'expiration_date': c.expiration_date,
                        'url': c.credential_url
                    }
                    for c in candidate.certifications
                ],
                'analysis_results': [
                    {
                        'date': a.analysis_date,
                        'insights': a.insights
                    }
                    for a in candidate.analysis_results
                ]
            }
            
        except Exception as e:
            self.logger.error(f"Error retrieving candidate data: {str(e)}")
            raise
        finally:
            session.close() 
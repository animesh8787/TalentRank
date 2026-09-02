import streamlit as st
import os
from preprocessing.processors.document_processor import DocumentProcessor
from preprocessing.processors.job_matcher import JobMatcher
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import pandas as pd

DATABASE_URL = "mysql+pymysql://root:123456@localhost:3306/resume_db"

# Helper function to parse job description input into a simple object
class JobDescription:
    def __init__(self, title, description, skills, experience, education, location, salary_range):
        self.title = title
        self.description = description
        self.required_skills = [skill.strip().lower() for skill in skills.split(',')] if skills else []
        self.required_experience = float(experience) if experience else 0.0
        self.required_education = education.strip().lower() if education else ""
        self.location = location
        self.salary_range = salary_range

def save_job_description(job_desc):
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        query = text("""
            INSERT INTO job_descriptions 
            (title, description, required_skills, required_experience, required_education, location, salary_range)
            VALUES (:title, :description, :skills, :experience, :education, :location, :salary)
        """)
        session.execute(query, {
            'title': job_desc.title,
            'description': job_desc.description,
            'skills': ','.join(job_desc.required_skills),
            'experience': job_desc.required_experience,
            'education': job_desc.required_education,
            'location': job_desc.location,
            'salary': job_desc.salary_range
        })
        session.commit()
        return True
    except Exception as e:
        session.rollback()
        st.error(f"Error saving job description: {str(e)}")
        return False
    finally:
        session.close()

def get_matching_candidates(job_id):
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Get job description
        job_query = text("SELECT * FROM job_descriptions WHERE job_id = :job_id")
        job = session.execute(job_query, {'job_id': job_id}).fetchone()
        
        if not job:
            return []
            
        # Get all candidates with their skills
        candidates_query = text("""
            SELECT c.*, GROUP_CONCAT(s.skill_name) as skills
            FROM candidates c
            LEFT JOIN skills s ON c.candidate_id = s.candidate_id
            GROUP BY c.candidate_id
        """)
        candidates = session.execute(candidates_query).fetchall()
        
        # Initialize job matcher
        matcher = JobMatcher()
        
        # Calculate match scores
        matches = []
        for candidate in candidates:
            # Calculate text similarity score
            score = matcher.calculate_match_score(
                candidate.resume_text,
                f"{job.description} {job.required_skills}"
            )
            
            # Calculate skills match
            candidate_skills = set(skill.lower().strip() for skill in candidate.skills.split(',')) if candidate.skills else set()
            job_skills = set(skill.lower().strip() for skill in job.required_skills.split(',')) if job.required_skills else set()
            
            skills_match = len(candidate_skills.intersection(job_skills)) / len(job_skills) if job_skills else 0
            
            matches.append({
                'candidate_id': candidate.candidate_id,
                'name': candidate.name,
                'email': candidate.email,
                'match_score': score,
                'skills_match': skills_match,
                'matched_skills': list(candidate_skills.intersection(job_skills)),
                'missing_skills': list(job_skills - candidate_skills)
            })
        
        # Sort by match score
        matches.sort(key=lambda x: x['match_score'], reverse=True)
        return matches
        
    except Exception as e:
        st.error(f"Error getting matching candidates: {str(e)}")
        return []
    finally:
        session.close()

def main():
    st.title("Recruiter Job Management System")

    tab1, tab2 = st.tabs(["Add Job Description", "View Job Matches"])

    with tab1:
        st.header("Add New Job Description")
        
        # Job details input
        job_title = st.text_input("Job Title", "")
        job_description = st.text_area("Detailed Job Description", "")
        skills_input = st.text_input("Required Skills (comma separated)", "")
        experience_input = st.text_input("Required Experience (years)", "")
        education_input = st.text_input("Required Education", "")
        location = st.text_input("Job Location", "")
        salary_range = st.text_input("Salary Range", "")
        
        if st.button("Save Job Description"):
            if not all([job_title, job_description, skills_input, experience_input, education_input, location]):
                st.error("Please fill in all required fields.")
            else:
                job_description_obj = JobDescription(
                    job_title, job_description, skills_input, 
                    experience_input, education_input, location, salary_range
                )
                if save_job_description(job_description_obj):
                    st.success("Job description saved successfully!")

    with tab2:
        st.header("View Job Matches")
        
        # Get all jobs
        engine = create_engine(DATABASE_URL)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        try:
            jobs_query = text("SELECT job_id, title FROM job_descriptions")
            jobs = session.execute(jobs_query).fetchall()
            
            if jobs:
                selected_job = st.selectbox(
                    "Select a job to view matches",
                    options=[(job.job_id, job.title) for job in jobs],
                    format_func=lambda x: x[1]
                )
                
                if selected_job:
                    matches = get_matching_candidates(selected_job[0])
                    
                    if matches:
                        st.subheader("Top Matching Candidates")
                        
                        # Create DataFrame for better display
                        df = pd.DataFrame(matches)
                        df['match_score'] = df['match_score'].apply(lambda x: f"{x:.2%}")
                        df['skills_match'] = df['skills_match'].apply(lambda x: f"{x:.2%}")
                        
                        # Display main match information
                        st.dataframe(
                            df[['name', 'email', 'match_score', 'skills_match']],
                            column_config={
                                'name': 'Candidate Name',
                                'email': 'Email',
                                'match_score': 'Overall Match',
                                'skills_match': 'Skills Match'
                            }
                        )
                        
                        # Display detailed skill matches for each candidate
                        for match in matches:
                            with st.expander(f"Skill Details for {match['name']}"):
                                st.write("Matched Skills:", ", ".join(match['matched_skills']) or "None")
                                st.write("Missing Skills:", ", ".join(match['missing_skills']) or "None")
                    else:
                        st.info("No matching candidates found.")
            else:
                st.info("No jobs available. Please add a job description first.")
                
        except Exception as e:
            st.error(f"Error loading jobs: {str(e)}")
        finally:
            session.close()

if __name__ == "__main__":
    main()

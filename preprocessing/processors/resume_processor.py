import os
from document_processor import DocumentProcessor
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import spacy
import re
from datetime import datetime
import PyPDF2
from docx import Document
import logging
from typing import Dict, List, Optional, Tuple
import unicodedata
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

class ResumeProcessor:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.engine = create_engine(db_url)
        self.Session = sessionmaker(bind=self.engine)
        self.nlp = spacy.load('en_core_web_lg')
        self.doc_processor = DocumentProcessor(db_uri=db_url)
        
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('resume_processing.log', encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
        # SQL Queries
        self.INSERT_CANDIDATE = """
            INSERT INTO candidates 
            (name, email, phone, total_experience, highest_qualification, 
             university, location, resume_text)
            VALUES (:name, :email, :phone, :experience, :education, 
                    :institution, :location, :resume_text)
        """
        
        self.INSERT_SKILL = """
            INSERT INTO skills 
            (candidate_id, skill_name, proficiency_level)
            VALUES (:candidate_id, :skill_name, :proficiency)
        """
        
        self.INSERT_WORK = """
            INSERT INTO work_experience 
            (candidate_id, company_name, job_title, start_date, end_date, description)
            VALUES (:candidate_id, :company, :title, :start_date, :end_date, :description)
        """
        
        self.CHECK_EMAIL = """
            SELECT candidate_id FROM candidates WHERE email = :email
        """
        
        # Common patterns and keywords
        self.education_keywords = {
            'phd': 'PhD',
            'doctorate': 'PhD',
            'master': 'Masters',
            'bachelor': 'Bachelors',
            'b.tech': 'Bachelors',
            'b.e.': 'Bachelors',
            'm.tech': 'Masters',
            'm.e.': 'Masters',
            'b.sc': 'Bachelors',
            'm.sc': 'Masters',
            'b.com': 'Bachelors',
            'm.com': 'Masters',
            'bca': 'Bachelors',
            'mca': 'Masters'
        }
        
        self.skill_categories = {
            'programming': [
                'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'ruby', 'php',
                'swift', 'kotlin', 'go', 'rust', 'scala', 'perl', 'r', 'matlab'
            ],
            'web_development': [
                'html', 'css', 'react', 'angular', 'vue', 'node.js', 'express', 'django',
                'flask', 'spring', 'asp.net', 'laravel', 'jquery', 'bootstrap', 'sass'
            ],
            'databases': [
                'sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'sqlite', 'redis',
                'cassandra', 'elasticsearch', 'dynamodb', 'neo4j'
            ],
            'cloud_platforms': [
                'aws', 'azure', 'gcp', 'heroku', 'digitalocean', 'ibm cloud',
                'alibaba cloud', 'oracle cloud'
            ],
            'devops': [
                'docker', 'kubernetes', 'jenkins', 'git', 'github', 'gitlab',
                'ansible', 'terraform', 'puppet', 'chef', 'prometheus', 'grafana'
            ],
            'data_science': [
                'machine learning', 'deep learning', 'data analysis', 'data mining',
                'statistics', 'pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch',
                'keras', 'spark', 'hadoop', 'hive', 'pig', 'tableau', 'power bi'
            ]
        }
        
    def extract_name(self, text: str) -> str:
        """Extract candidate name from resume text."""
        # Split text into lines and get the first few lines
        lines = text.split('\n')
        first_lines = ' '.join(lines[:3])  # Look at first 3 lines for name
        
        # Common patterns for name extraction
        patterns = [
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)',  # Standard name format
            r'^([A-Z][A-Z\s]+)',  # All caps name
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z][a-z]+)',  # Multiple words with caps
            r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z][A-Z]+)',  # Last name in caps
        ]
        
        for pattern in patterns:
            match = re.search(pattern, first_lines)
            if match:
                name = match.group(1).strip()
                # Clean up the name
                name = re.sub(r'\s+', ' ', name)  # Remove extra spaces
                name = re.sub(r'[^\w\s]', '', name)  # Remove special characters
                return name[:255]  # Ensure it fits in the database column
        
        # If no pattern matches, take first word as name
        first_word = lines[0].split()[0]
        return first_word[:255]
        
    def extract_location(self, text: str) -> Optional[str]:
        """Extract location from resume text."""
        # Common location patterns
        patterns = [
            r'(?:Location|Address|Based in|Residing in)[:\s]+([A-Za-z\s,]+)',
            r'([A-Za-z\s,]+(?:City|State|Country|Province))',
            r'([A-Za-z\s,]+(?:Street|Road|Avenue|Lane))'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                location = match.group(1).strip()
                return location[:255]  # Ensure it fits in the database column
        return None
        
    def clean_text(self, text: str) -> str:
        """Clean and normalize text content."""
        # Remove special characters and normalize unicode
        text = unicodedata.normalize('NFKD', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove non-printable characters
        text = ''.join(char for char in text if char.isprintable())
        return text.strip()
        
    def extract_text_from_pdf(self, file_path: str) -> Optional[str]:
        """Extract text from PDF file with error handling."""
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() + "\n"
                return self.clean_text(text)
        except Exception as e:
            self.logger.error(f"Error reading PDF {file_path}: {str(e)}")
            return None

    def extract_text_from_docx(self, file_path: str) -> Optional[str]:
        """Extract text from DOCX file with error handling."""
        try:
            doc = Document(file_path)
            text = ""
            for para in doc.paragraphs:
                text += para.text + "\n"
            return self.clean_text(text)
        except Exception as e:
            self.logger.error(f"Error reading DOCX {file_path}: {str(e)}")
            return None
        
    def extract_email(self, text: str) -> Optional[str]:
        """Extract email address with validation and normalization."""
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        match = re.search(email_pattern, text)
        if match:
            email = match.group(0).lower()
            # Basic email validation
            if re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
                # Normalize email by stripping trailing dots or commas
                email = email.rstrip('.,;:')
                return email
        return None

    def extract_links(self, text: str) -> List[str]:
        """Extract all URLs from the text."""
        url_pattern = r'(https?://[^\s,;]+)'
        links = re.findall(url_pattern, text)
        # Normalize links by stripping trailing punctuation
        normalized_links = [link.rstrip('.,;:') for link in links]
        return normalized_links
        
    def extract_phone(self, text: str) -> Optional[str]:
        """Extract phone number with international format support."""
        # Match various phone number formats
        phone_patterns = [
            r'\+?[\d\s-]{10,}',  # Basic format
            r'\+?1?\s*\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}',  # US format
            r'\+?[0-9]{2}[-.\s]?[0-9]{10}'  # International format
        ]
        
        for pattern in phone_patterns:
            match = re.search(pattern, text)
            if match:
                phone = re.sub(r'[^\d+]', '', match.group(0))
                if len(phone) >= 10:  # Basic length validation
                    return phone
        return None
        
    def extract_skills(self, text: str) -> List[Dict[str, str]]:
        """Extract skills with categorization and confidence scoring."""
        found_skills = []
        text_lower = text.lower()
        
        for category, skills in self.skill_categories.items():
            for skill in skills:
                if skill in text_lower:
                    # Calculate confidence based on context
                    confidence = self._calculate_skill_confidence(text_lower, skill)
                    if confidence > 0.5:  # Only include if confidence is high enough
                        found_skills.append({
                            'name': skill,
                            'proficiency': 'Expert' if confidence > 0.8 else 'Intermediate' if confidence > 0.6 else 'Basic'
                        })
        
        return found_skills
        
    def _calculate_skill_confidence(self, text: str, skill: str) -> float:
        """Calculate confidence score for a skill based on context."""
        confidence = 0.5  # Base confidence
        
        # Check for skill-related keywords
        skill_contexts = {
            'proficient': 0.3,
            'expert': 0.3,
            'experienced': 0.2,
            'skilled': 0.2,
            'knowledge': 0.1
        }
        
        for context, score in skill_contexts.items():
            if context in text:
                confidence += score
                
        return min(confidence, 1.0)  # Cap at 1.0
        
    def extract_experience(self, text: str) -> Tuple[float, List[Dict]]:
        """Extract experience with detailed work history."""
        # Extract total years
        exp_pattern = r'(\d+)[\+]?\s*(?:years?|yrs?)\s*(?:of)?\s*experience'
        match = re.search(exp_pattern, text.lower())
        total_years = float(match.group(1)) if match else 0.0
        
        # Extract work history
        work_history = []
        # Look for company names and dates
        company_pattern = r'(?:at|with|in)\s+([A-Z][A-Za-z\s&]+)'
        date_pattern = r'(?:from|since|during)\s+(\d{4})\s*(?:to|until|till)?\s*(\d{4}|present)?'
        title_pattern = r'(?:as|position|role|title)[:\s]+([A-Z][A-Za-z\s]+)'
        
        companies = re.finditer(company_pattern, text)
        for company in companies:
            company_name = company.group(1).strip()
            # Look for dates near the company name
            date_match = re.search(date_pattern, text[company.start():company.start()+200])
            title_match = re.search(title_pattern, text[company.start():company.start()+200])
            
            if date_match:
                start_date = f"{date_match.group(1)}-01-01"  # Convert to proper date format
                end_date = f"{date_match.group(2)}-12-31" if date_match.group(2) and date_match.group(2) != 'present' else None
                
                work_history.append({
                    'company': company_name,
                    'title': title_match.group(1).strip() if title_match else None,
                    'start_date': start_date,
                    'end_date': end_date,
                    'description': ''  # Add description extraction if needed
                })
        
        return total_years, work_history
        
    def extract_education(self, text: str) -> Dict:
        """Extract education details with institution and year."""
        education_info = {
            'degree': 'Bachelors',  # Default
            'institution': None,
            'year': None
        }
        
        text_lower = text.lower()
        
        # Find degree
        for keyword, degree in self.education_keywords.items():
            if keyword in text_lower:
                education_info['degree'] = degree
                break
        
        # Find institution
        institution_pattern = r'(?:from|at|in)\s+([A-Z][A-Za-z\s&]+(?:University|College|Institute|School))'
        institution_match = re.search(institution_pattern, text)
        if institution_match:
            education_info['institution'] = institution_match.group(1).strip()
        
        # Find graduation year
        year_pattern = r'(?:graduated|completed|degree)\s+(?:in|from)?\s*(\d{4})'
        year_match = re.search(year_pattern, text_lower)
        if year_match:
            education_info['year'] = year_match.group(1)
        
        return education_info
        
    def check_existing_email(self, session, email: str) -> Optional[int]:
        """Check if email already exists in database."""
        if not email:
            return None
        try:
            result = session.execute(text(self.CHECK_EMAIL), {'email': email})
            row = result.fetchone()
            return row[0] if row else None
        except SQLAlchemyError as e:
            self.logger.error(f"Error checking email: {str(e)}")
            return None

    def insert_candidate(self, session, data: Dict) -> Optional[int]:
        """Insert candidate data into database with duplicate handling."""
        try:
            # Check for existing email
            if data['email']:
                existing_id = self.check_existing_email(session, data['email'])
                if existing_id:
                    self.logger.info(f"Found existing candidate with email {data['email']}, ID: {existing_id}")
                    return existing_id

            # Insert new candidate
            stmt = text(self.INSERT_CANDIDATE)
            result = session.execute(stmt, data)
            session.commit()  # Commit to get the auto-incremented ID
            return result.inserted_primary_key[0]
        except IntegrityError as e:
            self.logger.error(f"Integrity error inserting candidate: {str(e)}")
            session.rollback()
            raise
        except SQLAlchemyError as e:
            self.logger.error(f"Error inserting candidate: {str(e)}")
            session.rollback()
            raise

    def insert_skills(self, session, candidate_id: int, skills: List[Dict]):
        """Insert skills data into database."""
        try:
            stmt = text(self.INSERT_SKILL)
            for skill in skills:
                session.execute(stmt, {
                    'candidate_id': candidate_id,
                    'skill_name': skill['name'],
                    'proficiency': skill['proficiency']
                })
            session.commit()
        except SQLAlchemyError as e:
            self.logger.error(f"Error inserting skills: {str(e)}")
            session.rollback()
            raise

    def insert_work_history(self, session, candidate_id: int, work_history: List[Dict]):
        """Insert work history data into database."""
        try:
            stmt = text(self.INSERT_WORK)
            for work in work_history:
                session.execute(stmt, {
                    'candidate_id': candidate_id,
                    'company': work['company'],
                    'title': work['title'],
                    'start_date': work['start_date'],
                    'end_date': work['end_date'],
                    'description': work['description']
                })
            session.commit()
        except SQLAlchemyError as e:
            self.logger.error(f"Error inserting work history: {str(e)}")
            session.rollback()
            raise

    def process_resume_file(self, file_path: str) -> Optional[int]:
        """Process a single resume file with comprehensive error handling."""
        try:
            self.logger.info(f"Processing file: {file_path}")
            
            # Extract text based on file type
            if file_path.lower().endswith('.pdf'):
                resume_text = self.extract_text_from_pdf(file_path)
            elif file_path.lower().endswith(('.docx', '.doc')):
                resume_text = self.extract_text_from_docx(file_path)
            else:
                self.logger.warning(f"Unsupported file format: {file_path}")
                return None
                
            if not resume_text:
                self.logger.error(f"Failed to extract text from {file_path}")
                return None
            
            # Extract information
            name = self.extract_name(resume_text)
            email = self.extract_email(resume_text)
            phone = self.extract_phone(resume_text)
            location = self.extract_location(resume_text)
            skills = self.extract_skills(resume_text)
            experience, work_history = self.extract_experience(resume_text)
            education = self.extract_education(resume_text)
            links = self.extract_links(resume_text)
            if links:
                self.logger.info(f"Extracted links: {links}")
            
            # Create session
            session = self.Session()
            
            try:
                # Prepare candidate data
                candidate_data = {
                    'name': name,
                    'email': email,
                    'phone': phone,
                    'location': location,
                    'experience': experience,
                    'education': education['degree'],
                    'institution': education['institution'],
                    'resume_text': resume_text[:65535]  # Limit text to MySQL TEXT field size
                }
                
                # Insert candidate and get ID
                candidate_id = self.insert_candidate(session, candidate_data)
                
                # Insert skills if any
                if skills:
                    self.insert_skills(session, candidate_id, skills)
                
                # Insert work history if any
                if work_history:
                    self.insert_work_history(session, candidate_id, work_history)
                
                self.logger.info(f"Successfully processed {os.path.basename(file_path)}")
                return candidate_id
                
            except SQLAlchemyError as e:
                self.logger.error(f"Database error processing {file_path}: {str(e)}")
                return None
            finally:
                session.close()
                
        except Exception as e:
            self.logger.error(f"Error processing {file_path}: {str(e)}")
            return None
            
    def process_directory(self, directory_path: str) -> Tuple[int, int]:
        """Process all resumes in a directory with progress tracking."""
        processed_files = 0
        failed_files = 0
        
        for root, _, files in os.walk(directory_path):
            for file in files:
                if file.lower().endswith(('.pdf', '.docx', '.doc', '.rtf')):
                    file_path = os.path.join(root, file)
                    self.logger.info(f"Processing {file}...")
                    
                    if self.process_resume_file(file_path):
                        processed_files += 1
                    else:
                        failed_files += 1
                        
        return processed_files, failed_files

def main():
    # Database connection
    DATABASE_URL = "mysql+pymysql://root:123456@localhost:3306/resume_db"
    
    # Initialize processor
    processor = ResumeProcessor(DATABASE_URL)
    
    # Process resumes
    input_dir = "src/components/datafiles/Input_files/sample resume"
    processed, failed = processor.process_directory(input_dir)
    
    print(f"\nProcessing complete!")
    print(f"Successfully processed: {processed} files")
    print(f"Failed to process: {failed} files")

if __name__ == "__main__":
    main() 
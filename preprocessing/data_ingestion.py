from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from Database_setup.db_design import Base, ResumeContent, Document, User
import PyPDF2
import os
from datetime import datetime

class DataIngestion:
    def __init__(self, db_url="sqlite:///your_database.db"):
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def extract_pdf_content(self, file_path):
        """Extract text content from PDF files"""
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text()
                return text
        except Exception as e:
            print(f"Error extracting PDF content: {str(e)}")
            return None

    def save_resume(self, file_path, user_id, title=None):
        """Save resume content to database"""
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")

            content = self.extract_pdf_content(file_path)
            if not content:
                raise ValueError("Could not extract content from file")

            file_type = os.path.splitext(file_path)[1].lower()
            title = title or os.path.basename(file_path)

            resume = ResumeContent(
                title=title,
                content=content,
                file_path=file_path,
                file_type=file_type,
                user_id=user_id
            )

            self.session.add(resume)
            self.session.commit()
            return True, "Resume saved successfully"

        except Exception as e:
            self.session.rollback()
            return False, f"Error saving resume: {str(e)}"

    def save_document(self, file_path, user_id, title=None):
        """Save document content to database"""
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")

            content = self.extract_pdf_content(file_path)
            if not content:
                raise ValueError("Could not extract content from file")

            file_type = os.path.splitext(file_path)[1].lower()
            title = title or os.path.basename(file_path)

            document = Document(
                title=title,
                content=content,
                file_path=file_path,
                file_type=file_type,
                user_id=user_id
            )

            self.session.add(document)
            self.session.commit()
            return True, "Document saved successfully"

        except Exception as e:
            self.session.rollback()
            return False, f"Error saving document: {str(e)}"

    def close(self):
        """Close the database session"""
        self.session.close()

# Example usage
if __name__ == "__main__":
    ingestion = DataIngestion()
    
    # Example: Save a resume
    success, message = ingestion.save_resume(
        file_path="path/to/resume.pdf",
        user_id=1,
        title="John Doe Resume"
    )
    print(message)

    # Example: Save a document
    success, message = ingestion.save_document(
        file_path="path/to/document.pdf",
        user_id=1,
        title="Important Document"
    )
    print(message)

    ingestion.close()

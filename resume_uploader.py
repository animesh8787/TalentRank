import streamlit as st
import os
import logging
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('resume_upload.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def get_upload_directory():
    """Get the upload directory path"""
    try:
        # Get the absolute path of the current script
        current_dir = Path(__file__).resolve().parent
        logger.info(f"Current directory: {current_dir}")
        
        # Get the project root directory (3 levels up from current script)
        project_root = current_dir.parent.parent.parent
        logger.info(f"Project root: {project_root}")
        
        # Construct the upload directory path
        upload_dir = project_root / 'src' / 'components' / 'datafiles' / 'Input_files' / 'sample resume'
        logger.info(f"Upload directory: {upload_dir}")
        
        # Create directory if it doesn't exist
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Verify directory exists and is writable
        if not os.path.exists(upload_dir):
            raise Exception(f"Failed to create directory: {upload_dir}")
        if not os.access(upload_dir, os.W_OK):
            raise Exception(f"Directory not writable: {upload_dir}")
            
        return str(upload_dir)
    except Exception as e:
        logger.error(f"Error getting upload directory: {str(e)}")
        raise

def validate_file(file):
    """Validate the uploaded file"""
    # Check file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB in bytes
    if file.size > max_size:
        raise ValueError(f"File size exceeds maximum limit of 10MB")
    
    # Check file extension
    allowed_extensions = {'.pdf', '.docx'}
    file_extension = os.path.splitext(file.name)[1].lower()
    if file_extension not in allowed_extensions:
        raise ValueError(f"File type not allowed. Please upload PDF or DOCX files only")

def generate_unique_filename(original_filename):
    """Generate a unique filename to prevent overwrites"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name, ext = os.path.splitext(original_filename)
    return f"{name}_{timestamp}{ext}"

def save_uploaded_file(uploaded_file, target_dir):
    """Save the uploaded file to the target directory"""
    try:
        # Validate file
        validate_file(uploaded_file)
        
        # Generate unique filename
        unique_filename = generate_unique_filename(uploaded_file.name)
        file_path = os.path.join(target_dir, unique_filename)
        logger.info(f"Attempting to save file to: {file_path}")
        
        # Save the file
        with open(file_path, "wb") as f:
            f.write(uploaded_file.getbuffer())
        
        # Verify file was saved
        if not os.path.exists(file_path):
            raise Exception(f"File was not saved successfully at: {file_path}")
            
        logger.info(f"Successfully saved file: {unique_filename}")
        return True, unique_filename
    except ValueError as ve:
        logger.warning(f"Validation error: {str(ve)}")
        return False, str(ve)
    except Exception as e:
        logger.error(f"Error saving file: {str(e)}")
        return False, f"Error saving file: {str(e)}"

def main():
    st.title("Resume Uploader")
    st.write("Upload your resume in PDF or DOCX format")
    
    try:
        # Get upload directory
        input_dir = get_upload_directory()
        
        # File uploader
        uploaded_file = st.file_uploader("Choose a file", type=['pdf', 'docx'])
        
        if uploaded_file is not None:
            # Save the file
            success, message = save_uploaded_file(uploaded_file, input_dir)
            
            if success:
                st.success("File uploaded successfully!")
            else:
                st.error(message)
                
    except Exception as e:
        logger.error(f"Application error: {str(e)}")
        st.error("An error occurred. Please try again later.")

if __name__ == "__main__":
    main() 
import sys
from src.logger import logging
from typing import Optional

class CustomException(Exception):
    def __init__(self, error_message, error_detail):
        super().__init__(error_message)
        self.error_message = error_message
        self.error_detail = error_detail
        self.error_info = self._get_error_info()

    def _get_error_info(self) -> dict:
        """Extract detailed error information"""
        if self.error_detail:
            _, _, exc_tb = self.error_detail.exc_info()
            file_name = exc_tb.tb_frame.f_code.co_filename
            line_number = exc_tb.tb_lineno
            function_name = exc_tb.tb_frame.f_code.co_name
            
            return {
                'file_name': file_name,
                'line_number': line_number,
                'function_name': function_name
            }
        return {}

    def __str__(self) -> str:
        """Format error message with details"""
        if self.error_info:
            return f"Error occurred in Python script:\n" \
                   f"File: {self.error_info['file_name']}\n" \
                   f"Line: {self.error_info['line_number']}\n" \
                   f"Function: {self.error_info['function_name']}\n" \
                   f"Error Message: {self.error_message}"
        return self.error_message

class FileProcessingError(CustomException):
    """Custom exception for file processing errors"""
    pass

class DatabaseError(CustomException):
    """Custom exception for database operations"""
    pass

class ValidationError(CustomException):
    """Custom exception for data validation errors"""
    pass

def handle_exception(error: Exception, error_detail:sys) -> None:
    """
    Handle exceptions and log them appropriately
    
    Args:
        error: The exception that occurred
        error_detail: Optional sys module for detailed error information
    """
    try:
        if isinstance(error, CustomException):
            logging.error(str(error))
        else:
            custom_error = CustomException(str(error), error_detail)
            logging.error(str(custom_error))
    except Exception as e:
        logging.error(f"Error in exception handling: {str(e)}")
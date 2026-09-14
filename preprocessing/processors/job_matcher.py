from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class JobMatcher:
    """A class to match resumes with job descriptions using TF-IDF and cosine similarity."""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer()
        
    def calculate_match_score(self, resume_text: str, job_description: str) -> float:
        """
        Calculate the match score between a resume and job description.
        
        Args:
            resume_text: The text content of the resume
            job_description: The text content of the job description
            
        Returns:
            float: A similarity score between 0 and 1
        """
        # Convert texts to vectors
        vectors = self.vectorizer.fit_transform([resume_text, job_description])
        
        # Calculate cosine similarity
        similarity = cosine_similarity(vectors[0:1], vectors[1:2])[0][0]
        return similarity 
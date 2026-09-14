from preprocessing.dataextraction import JobMatcher
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from typing import List, Dict, Any
import spacy
import re

class ResumeRanker:
    def __init__(self):
        self.job_matcher = JobMatcher()
        self.nlp = spacy.load('en_core_web_lg')
        self.vectorizer = TfidfVectorizer(stop_words='english')
        
        # Education level mapping with scores
        self.education_levels = {
            'high school': 1,
            'associate': 2,
            'bachelor': 3,
            'master': 4,
            'phd': 5,
            'doctorate': 5
        }
        
        # Skill proficiency weights
        self.skill_weights = {
            'expert': 1.0,
            'advanced': 0.8,
            'intermediate': 0.6,
            'beginner': 0.4
        }

    def rank_resumes(self, job_description, resumes: List[Any]) -> List[Dict[str, Any]]:
        """
        Rank resumes based on multiple criteria with improved scoring
        """
        # Pre-process job description
        job_skills = set(skill.lower().strip() for skill in job_description.required_skills)
        job_text = f"{job_description.description} {' '.join(job_skills)}"
        
        # Calculate TF-IDF vectors for job description
        job_vector = self.vectorizer.fit_transform([job_text])
        
        scored_resumes = []
        for resume in resumes:
            # Calculate various match scores
            skill_score = self._calculate_skill_match(resume.skills, job_skills)
            exp_score = self._calculate_experience_match(resume.total_experience, job_description.required_experience)
            edu_score = self._calculate_education_match(resume.highest_qualification, job_description.required_education)
            text_similarity = self._calculate_text_similarity(resume.resume_text, job_text)
            location_score = self._calculate_location_match(resume.location, job_description.location)
            
            # Calculate weighted overall score
            overall_score = (
                skill_score * 0.35 +      # Skills weight
                exp_score * 0.25 +        # Experience weight
                edu_score * 0.15 +        # Education weight
                text_similarity * 0.15 +   # Text similarity weight
                location_score * 0.10      # Location weight
            )
            
            # Calculate skill match details
            skill_matches = self._get_skill_match_details(resume.skills, job_skills)
            
            scored_resumes.append({
                'resume': resume,
                'skill_score': skill_score,
                'experience_score': exp_score,
                'education_score': edu_score,
                'text_similarity': text_similarity,
                'location_score': location_score,
                'overall_score': overall_score,
                'skill_matches': skill_matches,
                'missing_skills': list(job_skills - set(skill.lower() for skill in resume.skills))
            })
        
        # Sort by overall score
        return sorted(scored_resumes, key=lambda x: x['overall_score'], reverse=True)

    def _calculate_skill_match(self, resume_skills: List[str], required_skills: set) -> float:
        """
        Enhanced skill matching with proficiency levels and semantic similarity
        """
        if not required_skills:
            return 0.0
            
        # Convert skills to lowercase for comparison
        resume_skills_lower = [skill.lower() for skill in resume_skills]
        required_skills_lower = {skill.lower() for skill in required_skills}
        
        # Calculate exact matches
        exact_matches = set(resume_skills_lower).intersection(required_skills_lower)
        
        # Calculate semantic similarity for non-exact matches
        semantic_matches = 0
        for req_skill in required_skills_lower:
            if req_skill not in exact_matches:
                req_doc = self.nlp(req_skill)
                for res_skill in resume_skills_lower:
                    if res_skill not in exact_matches:
                        res_doc = self.nlp(res_skill)
                        similarity = req_doc.similarity(res_doc)
                        if similarity > 0.8:  # High similarity threshold
                            semantic_matches += 1
                            break
        
        total_matches = len(exact_matches) + semantic_matches
        return (total_matches / len(required_skills)) * 100.0

    def _calculate_experience_match(self, resume_experience: float, required_experience: float) -> float:
        """
        Enhanced experience matching with logarithmic scaling
        """
        if not required_experience:
            return 0.0
            
        if resume_experience >= required_experience:
            # Cap the score at 1.0 for meeting requirements
            return 1.0
            
        # Use logarithmic scaling for partial matches
        ratio = resume_experience / required_experience
        return np.log1p(ratio) / np.log1p(1.0)

    def _calculate_education_match(self, resume_education: str, required_education: str) -> float:
        """
        Enhanced education matching with level comparison
        """
        if not required_education:
            return 0.0
            
        resume_level = self._get_education_level(resume_education)
        required_level = self._get_education_level(required_education)
        
        if resume_level >= required_level:
            return 1.0
        else:
            # Partial score based on how close they are
            return 0.5 * (resume_level / required_level)

    def _calculate_text_similarity(self, resume_text: str, job_text: str) -> float:
        """
        Calculate text similarity using TF-IDF and cosine similarity
        """
        try:
            vectors = self.vectorizer.fit_transform([resume_text, job_text])
            similarity = cosine_similarity(vectors[0:1], vectors[1:2])[0][0]
            return float(similarity)
        except:
            return 0.0

    def _calculate_location_match(self, resume_location: str, job_location: str) -> float:
        """
        Calculate location match score
        """
        if not resume_location or not job_location:
            return 0.0
            
        # Simple exact match for now
        return 1.0 if resume_location.lower() == job_location.lower() else 0.0

    def _get_education_level(self, education: str) -> int:
        """
        Get numeric education level
        """
        education = education.lower()
        for level, score in self.education_levels.items():
            if level in education:
                return score
        return 0

    def _get_skill_match_details(self, resume_skills: List[str], required_skills: set) -> Dict[str, Any]:
        """
        Get detailed skill match information
        """
        matches = {
            'exact_matches': [],
            'partial_matches': [],
            'missing_skills': []
        }
        
        for req_skill in required_skills:
            found = False
            for res_skill in resume_skills:
                if req_skill.lower() == res_skill.lower():
                    matches['exact_matches'].append(res_skill)
                    found = True
                    break
                elif self.nlp(req_skill).similarity(self.nlp(res_skill)) > 0.8:
                    matches['partial_matches'].append(res_skill)
                    found = True
                    break
            if not found:
                matches['missing_skills'].append(req_skill)
                
        return matches

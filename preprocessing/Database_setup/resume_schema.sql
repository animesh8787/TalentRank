CREATE TABLE job_descriptions (
	job_id INT NOT NULL AUTO_INCREMENT,
	title VARCHAR(255) NOT NULL,
	description TEXT NOT NULL,
	required_skills TEXT NOT NULL,
	required_experience FLOAT NOT NULL,
	required_education VARCHAR(255) NOT NULL,
	location VARCHAR(255) NOT NULL,
	salary_range VARCHAR(255),
	posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	status VARCHAR(20) DEFAULT 'Active',
	PRIMARY KEY (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE  candidates (
	candidate_id INTEGER NOT NULL, 
	name VARCHAR(255), 
	email VARCHAR(255), 
	phone VARCHAR(20), 
	linkedin VARCHAR(255), 
	github VARCHAR(255), 
	total_experience FLOAT, 
	highest_qualification VARCHAR(255), 
	university VARCHAR(255), 
	location VARCHAR(255), 
	resume_text TEXT, 
	PRIMARY KEY (candidate_id), 
	UNIQUE (email)
);

CREATE TABLE  skills (
	skill_id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	skill_name VARCHAR(255), 
	proficiency_level VARCHAR(12), 
	PRIMARY KEY (skill_id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

CREATE TABLE  projects (
	project_id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	project_title VARCHAR(255), 
	project_description TEXT, 
	technologies_used TEXT, 
	project_url VARCHAR(255), 
	PRIMARY KEY (project_id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

CREATE TABLE  work_experience (
	work_id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	company_name VARCHAR(255), 
	job_title VARCHAR(255), 
	start_date DATE, 
	end_date DATE, 
	description TEXT, 
	PRIMARY KEY (work_id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

CREATE TABLE certifications (
	cert_id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	certification_name VARCHAR(255), 
	issuing_organization VARCHAR(255), 
	issue_date DATE, 
	expiration_date DATE, 
	credential_url VARCHAR(255), 
	PRIMARY KEY (cert_id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

CREATE TABLE rankings (
	ranking_id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	job_id INTEGER,
	skill_score FLOAT,
	experience_score FLOAT,
	education_score FLOAT,
	text_similarity_score FLOAT,
	location_score FLOAT,
	overall_score FLOAT,
	skill_matches TEXT,
	missing_skills TEXT,
	match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
	match_status VARCHAR(20) DEFAULT 'Pending',
	PRIMARY KEY (ranking_id),
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id),
	FOREIGN KEY(job_id) REFERENCES job_descriptions (job_id)
);

CREATE TABLE job_matches (
	match_id INTEGER NOT NULL,
	job_id INTEGER,
	candidate_id INTEGER,
	match_score FLOAT,
	skill_match_percentage FLOAT,
	experience_match_percentage FLOAT,
	education_match_percentage FLOAT,
	text_similarity FLOAT,
	location_match BOOLEAN,
	match_details TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	status VARCHAR(20) DEFAULT 'New',
	notes TEXT,
	PRIMARY KEY (match_id),
	FOREIGN KEY(job_id) REFERENCES job_descriptions (job_id),
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

CREATE TABLE match_history (
	history_id INTEGER NOT NULL,
	match_id INTEGER,
	status_change VARCHAR(20),
	changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	changed_by VARCHAR(255),
	notes TEXT,
	PRIMARY KEY (history_id),
	FOREIGN KEY(match_id) REFERENCES job_matches (match_id)
);

CREATE TABLE  analysis_results (
	id INTEGER NOT NULL, 
	candidate_id INTEGER, 
	analysis_date DATETIME, 
	insights TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(candidate_id) REFERENCES candidates (candidate_id)
);

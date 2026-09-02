from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db_design import Base

DATABASE_URL = "mysql+pymysql://root:123456@localhost:3306/resume_db"

engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
session = Session()

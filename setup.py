from setuptools import setup, find_packages
from typing import list
hypendot="-e ."
def get_requirements(file_path:str)->list[str]:
    requirements=[]
    with open('requirements.txt', 'r') as f:
        requirements=f.readlines()
        requirements=[req.replace("n","") for req in requirements ]
        if hypendot in requirements:
            requirements.remove(hypendot)
        return requirements


setup(
    name="src",
    version="0.0.1",
    author="AYUSH",
    author_email="ayushrajputparihar@gmail.com",
    packages=find_packages(),
    install_requires=get_requirements('requirements.txt')
)
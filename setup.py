from setuptools import setup
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Read package.json
with open(os.path.join(HERE, "extension", "package.json")) as f:
    package_json = json.load(f)

# Read requirements.txt
with open(os.path.join(HERE, "binder", "requirements.txt")) as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="jupyterlab-angular-demo",
    version=package_json["version"],
    description="Angular × JupyterLab Extension Demo",
    author="",
    author_email="",
    url="",
    license="BSD-3-Clause",
    install_requires=requirements,
    include_package_data=True,
    zip_safe=False,
)


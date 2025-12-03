"""
Setup file for jupyterlab-angular-demo JupyterLab extension.
"""
from pathlib import Path
from setuptools import setup

HERE = Path(__file__).parent.resolve()

# The name of the project
name = "jupyterlab-angular-demo"

# Output directory is "../dist/jupyter-desktop" as specified in webpack.config.js
lab_path = HERE.parent / "dist" / "jupyter-desktop"

# Representative files that should exist after a successful build
ensured_targets = [
    str(lab_path / "remoteEntry.js"),
    str(lab_path / "index.js"),
]

# Data files specification for JupyterLab extension installation
# The structure must match JupyterLab's expected labextension format
# Note: lab_path is outside HERE, so we need to use absolute paths
data_files_spec = [
    # Install package.json to the root of the extension directory
    ("share/jupyter/labextensions/jupyterlab-angular-demo", str(HERE), "package.json"),
    # Install all static files (remoteEntry.js, index.js, etc.) from the dist directory
    ("share/jupyter/labextensions/jupyterlab-angular-demo/static", str(lab_path), "**/*"),
    # Install style files
    ("share/jupyter/labextensions/jupyterlab-angular-demo/style", str(HERE / "style"), "**/*"),
    # Install install.json for extension metadata
    ("share/jupyter/labextensions/jupyterlab-angular-demo", str(HERE), "install.json"),
]

setup_args = dict(
    name=name,
    version="0.1.0",
    description="Angular × JupyterLab Extension Demo",
    author="",
    author_email="",
    url="",
    license="BSD-3-Clause",
    py_modules=[],
    packages=[],
    zip_safe=False,
    include_package_data=True,
)

try:
    from jupyter_packaging import (
        wrap_installers,
        npm_builder,
        get_data_files
    )
    from glob import glob
    import os
    
    post_develop = npm_builder(
        build_cmd="build", source_dir=".", build_dir=str(lab_path)
    )
    setup_args["cmdclass"] = wrap_installers(
        post_develop=post_develop, ensured_targets=ensured_targets
    )
    
    # Manually build data_files since lab_path is outside HERE
    data_files = []
    
    # Install package.json
    if (HERE / "package.json").exists():
        data_files.append((
            "share/jupyter/labextensions/jupyterlab-angular-demo",
            [str(HERE / "package.json")]
        ))
    
    # Install install.json
    if (HERE / "install.json").exists():
        data_files.append((
            "share/jupyter/labextensions/jupyterlab-angular-demo",
            [str(HERE / "install.json")]
        ))
    
    # Install all static files from lab_path
    if lab_path.exists():
        static_files = []
        for pattern in ["**/*.js", "**/*.js.map", "**/*.css", "**/*.html", "**/*.svg", "**/*.png"]:
            static_files.extend(glob(str(lab_path / pattern), recursive=True))
        if static_files:
            data_files.append((
                "share/jupyter/labextensions/jupyterlab-angular-demo/static",
                static_files
            ))
    
    # Install style files
    style_dir = HERE / "style"
    if style_dir.exists():
        style_files = []
        for pattern in ["**/*.css", "**/*.svg"]:
            style_files.extend(glob(str(style_dir / pattern), recursive=True))
        if style_files:
            data_files.append((
                "share/jupyter/labextensions/jupyterlab-angular-demo/style",
                style_files
            ))
    
    setup_args["data_files"] = data_files
except ImportError as e:
    import logging
    logging.basicConfig(format="%(levelname)s: %(message)s")
    logging.warning(
        "Build tool `jupyter-packaging` is not installed. "
        "It is required for building a development install. "
        "Please install it with pip or conda."
    )
    # Don't fail if jupyter-packaging is not installed
    setup_args["data_files"] = []

if __name__ == "__main__":
    setup(**setup_args)

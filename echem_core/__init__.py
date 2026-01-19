"""
echem_core - Electrochemistry data processing library

A backend library for processing electrochemistry data from BioLogic and Gamry
instruments. Designed for use with various frontends (marimo, FastAPI, etc.)
and for integration with multi-technique analysis pipelines.
"""

__version__ = "0.1.0"

# Types
from .types import EchemDataset

# Parsers will be imported here once created
# from .parsers import load_file, load_file_bytes

# Export functions will be imported here once created
# from .export import export_session, export_session_bytes, import_session, import_session_bytes

# Storage will be imported here once created
# from .storage import DataStore

# Code generation will be imported here once created
# from .codegen import generate_plot_code

__all__ = [
    "__version__",
    "EchemDataset",
    # "load_file",
    # "load_file_bytes",
    # "export_session",
    # "export_session_bytes",
    # "import_session",
    # "import_session_bytes",
    # "DataStore",
    # "generate_plot_code",
]

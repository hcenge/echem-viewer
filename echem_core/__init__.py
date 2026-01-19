"""
echem_core - Electrochemistry data processing library

A backend library for processing electrochemistry data from BioLogic and Gamry
instruments. Designed for use with various frontends (marimo, FastAPI, etc.)
and for integration with multi-technique analysis pipelines.
"""

__version__ = "0.1.0"

# Types
from .types import EchemDataset

# Parsers
from .parsers import load_file, load_file_bytes

# Analysis
from .analysis import find_hf_intercept, find_lf_intercept, calculate_time_average

__all__ = [
    "__version__",
    "EchemDataset",
    "load_file",
    "load_file_bytes",
    "find_hf_intercept",
    "find_lf_intercept",
    "calculate_time_average",
]

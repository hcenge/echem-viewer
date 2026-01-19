"""
echem_core - Electrochemistry data processing library

A backend library for processing electrochemistry data from BioLogic and Gamry
instruments. Designed for use with various frontends (marimo, FastAPI, etc.)
and for integration with multi-technique analysis pipelines.
"""

__version__ = "0.1.0"

# Types
from .types import EchemDataset, TECHNIQUE_MAP, TECHNIQUE_DEFAULTS

# Parsers
from .parsers import load_file, load_file_bytes

# Analysis
from .analysis import (
    find_hf_intercept,
    find_lf_intercept,
    calculate_time_average,
    calculate_charge,
    overpotential_at_current,
    onset_potential,
    limiting_current,
    current_at_potential,
    steady_state_potential,
)

# Storage
from .storage import DataStore

# Export/Import
from .export import session_export, session_import, csv_export

# Code generation
from .codegen import generate_plot_code

# Transforms
from .transforms import (
    REFERENCE_ELECTRODES,
    convert_reference,
    ir_compensate,
    normalize_by_area,
    normalize_by_mass,
    filter_by_cycle,
    filter_dataset_by_cycle,
    downsample,
)

__all__ = [
    "__version__",
    "EchemDataset",
    "TECHNIQUE_MAP",
    "TECHNIQUE_DEFAULTS",
    # Parsers
    "load_file",
    "load_file_bytes",
    # Analysis
    "find_hf_intercept",
    "find_lf_intercept",
    "calculate_time_average",
    "calculate_charge",
    "overpotential_at_current",
    "onset_potential",
    "limiting_current",
    "current_at_potential",
    "steady_state_potential",
    # Storage
    "DataStore",
    # Export
    "session_export",
    "session_import",
    "csv_export",
    # Codegen
    "generate_plot_code",
    # Transforms
    "REFERENCE_ELECTRODES",
    "convert_reference",
    "ir_compensate",
    "normalize_by_area",
    "normalize_by_mass",
    "filter_by_cycle",
    "filter_dataset_by_cycle",
    "downsample",
]

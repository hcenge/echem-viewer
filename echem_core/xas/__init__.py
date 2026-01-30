"""
XAS (X-ray Absorption Spectroscopy) processing module.

Provides:
- H5 file reading and scan validation
- XANES normalization using Larch
- Scan averaging
- Derivative calculation
- Lorentzian peak fitting for second derivative analysis
"""

from .processing import (
    normalize_single_scan,
    average_scans_for_dataset,
    calculate_derivative,
)
from .peak_fitting import (
    lorentzian_d2,
    fit_peaks,
    estimate_initial_guesses,
)
from .h5_reader import (
    scan_h5_for_datasets,
    find_valid_scans,
    read_scan_data,
    BEAMLINE_CONFIGS,
    DatasetInfo,
)

__all__ = [
    # Processing
    "normalize_single_scan",
    "average_scans_for_dataset",
    "calculate_derivative",
    # Peak fitting
    "lorentzian_d2",
    "fit_peaks",
    "estimate_initial_guesses",
    # H5 reading
    "scan_h5_for_datasets",
    "find_valid_scans",
    "read_scan_data",
    "BEAMLINE_CONFIGS",
    "DatasetInfo",
]

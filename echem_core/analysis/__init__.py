"""Analysis functions for electrochemistry data."""

from .eis import find_hf_intercept, find_lf_intercept
from .ca import calculate_time_average, calculate_charge
from .cp import overpotential_at_current
from .cv import onset_potential as cv_onset_potential
from .lsv import onset_potential, limiting_current, current_at_potential
from .ocv import steady_state_potential


__all__ = [
    # EIS
    "find_hf_intercept",
    "find_lf_intercept",
    # CA
    "calculate_time_average",
    "calculate_charge",
    # CP
    "overpotential_at_current",
    # CV
    "cv_onset_potential",
    # LSV
    "onset_potential",
    "limiting_current",
    "current_at_potential",
    # OCV
    "steady_state_potential",
]

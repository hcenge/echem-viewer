"""Analysis functions for electrochemistry data."""

from .eis import find_hf_intercept, find_lf_intercept
from .ca import calculate_time_average


__all__ = [
    "find_hf_intercept",
    "find_lf_intercept",
    "calculate_time_average",
]

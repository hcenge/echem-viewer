"""Linear Sweep Voltammetry (LSV) analysis functions."""

import numpy as np
import polars as pl


def onset_potential(
    df: pl.DataFrame,
    threshold_current_A: float,
    potential_col: str = "potential_V",
    current_col: str = "current_A",
) -> float | None:
    """Find onset potential where current exceeds threshold.

    Args:
        df: DataFrame (filter by cycle first if needed)
        threshold_current_A: Current threshold in Amperes
        potential_col: Name of potential column
        current_col: Name of current column

    Returns:
        Onset potential in Volts, or None if not found
    """
    if potential_col not in df.columns or current_col not in df.columns:
        return None

    potential = df[potential_col].to_numpy()
    current = df[current_col].to_numpy()

    above_threshold = np.abs(current) > abs(threshold_current_A)
    if not np.any(above_threshold):
        return None

    idx = np.argmax(above_threshold)
    return float(potential[idx])


def limiting_current(
    df: pl.DataFrame,
    current_col: str = "current_A",
    window_frac: float = 0.1,
) -> float | None:
    """Find limiting (plateau) current from end of sweep.

    Args:
        df: DataFrame (filter by cycle first if needed)
        current_col: Name of current column
        window_frac: Fraction of data at end to average (default 10%)

    Returns:
        Limiting current in Amperes, or None if not found
    """
    if current_col not in df.columns:
        return None

    current = df[current_col].to_numpy()
    if len(current) == 0:
        return None

    n_points = max(1, int(len(current) * window_frac))
    return float(np.mean(current[-n_points:]))


def current_at_potential(
    df: pl.DataFrame,
    potential_V: float,
    potential_col: str = "potential_V",
    current_col: str = "current_A",
) -> float | None:
    """Extract current at a specific potential (for multi-file comparison).

    Args:
        df: DataFrame (filter by cycle first if needed)
        potential_V: Target potential in Volts
        potential_col: Name of potential column
        current_col: Name of current column

    Returns:
        Current in Amperes, or None if out of range
    """
    if potential_col not in df.columns or current_col not in df.columns:
        return None

    potential = df[potential_col].to_numpy()
    current = df[current_col].to_numpy()

    if len(potential) == 0 or potential_V < potential.min() or potential_V > potential.max():
        return None

    idx = np.argmin(np.abs(potential - potential_V))
    return float(current[idx])

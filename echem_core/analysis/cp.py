"""Chronopotentiometry (CP) analysis functions."""

import polars as pl


def calculate_time_average(
    df: pl.DataFrame,
    column: str,
    t_start: float,
    t_end: float,
    time_col: str = "time_s",
) -> float | None:
    """Calculate average value over a time range (steady-state).

    Args:
        df: DataFrame (filter by cycle first if needed)
        column: Column to average (typically 'potential_V' for CP)
        t_start: Start time in seconds
        t_end: End time in seconds

    Returns:
        Average value, or None if no data in range
    """
    if time_col not in df.columns or column not in df.columns:
        return None

    filtered = df.filter(
        (pl.col(time_col) >= t_start) & (pl.col(time_col) <= t_end)
    )

    if filtered.height == 0:
        return None

    return float(filtered[column].mean())


def overpotential_at_current(
    df: pl.DataFrame,
    target_current_A: float,
    equilibrium_V: float = 0.0,
    potential_col: str = "potential_V",
    current_col: str = "current_A",
) -> float | None:
    """Find overpotential at a specific current (for benchmarking).

    Args:
        df: DataFrame
        target_current_A: Target current in Amperes
        equilibrium_V: Equilibrium potential (default 0 for OER/HER)
        potential_col: Name of potential column
        current_col: Name of current column

    Returns:
        Overpotential in Volts, or None if not found
    """
    if potential_col not in df.columns or current_col not in df.columns:
        return None

    import numpy as np
    current = df[current_col].to_numpy()
    potential = df[potential_col].to_numpy()

    if len(current) == 0:
        return None

    idx = np.argmin(np.abs(current - target_current_A))
    return float(abs(potential[idx] - equilibrium_V))


# --- Stubs for future implementation ---

def find_transition_time(df: pl.DataFrame) -> float | None:
    """Find τ where potential changes sharply (Sand equation).

    Not implemented.
    """
    raise NotImplementedError("Transition time analysis not implemented")


def assess_stability(df: pl.DataFrame, window_size: float) -> dict | None:
    """Track potential drift/decay over time.

    Not implemented.
    """
    raise NotImplementedError("Stability assessment not implemented")

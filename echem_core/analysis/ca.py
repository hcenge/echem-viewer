"""Chronoamperometry (CA) and Chronopotentiometry (CP) analysis functions."""

import polars as pl


def calculate_time_average(
    df: pl.DataFrame,
    column: str,
    t_start: float,
    t_end: float,
    time_col: str = "time_s",
) -> float | None:
    """Calculate average value over a time range.

    Used for CA (chronoamperometry) and CP (chronopotentiometry) analysis
    to get steady-state current or voltage values.

    Args:
        df: DataFrame with time and value columns
        column: Column to average (e.g., 'current_A' for CA, 'potential_V' for CP)
        t_start: Start time in seconds
        t_end: End time in seconds
        time_col: Name of time column (default: 'time_s')

    Returns:
        Average value in SI units, or None if no data in range
    """
    if time_col not in df.columns or column not in df.columns:
        return None

    filtered = df.filter(
        (pl.col(time_col) >= t_start) & (pl.col(time_col) <= t_end)
    )

    if filtered.height == 0:
        return None

    return float(filtered[column].mean())


def calculate_charge(
    df: pl.DataFrame,
    time_col: str = "time_s",
    current_col: str = "current_A",
) -> float | None:
    """Calculate total charge Q = ∫I dt.

    Args:
        df: DataFrame (filter by cycle first if needed)
        time_col: Name of time column
        current_col: Name of current column

    Returns:
        Total charge in Coulombs, or None if columns missing
    """
    if time_col not in df.columns or current_col not in df.columns:
        return None

    import numpy as np
    time = df[time_col].to_numpy()
    current = df[current_col].to_numpy()

    if len(time) < 2:
        return None

    return float(np.trapz(current, time))


# --- Stubs for future implementation ---

def assess_stability(df: pl.DataFrame, window_size: float) -> dict | None:
    """Assess catalyst decay: current retention %, drift rate.

    Not implemented.
    """
    raise NotImplementedError("Stability assessment not implemented")


def cottrell_fit(df: pl.DataFrame) -> dict | None:
    """Fit I vs t^(-1/2) for diffusion coefficient.

    Not implemented - use instrument software.
    """
    raise NotImplementedError("Use instrument software for Cottrell analysis")

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

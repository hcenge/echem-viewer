"""Open Circuit Voltage (OCV) analysis functions."""

import polars as pl


def steady_state_potential(
    df: pl.DataFrame,
    window_s: float = 10.0,
    time_col: str = "time_s",
    potential_col: str = "potential_V",
) -> float | None:
    """Get final equilibrium potential (average of last N seconds).

    Args:
        df: DataFrame
        window_s: Time window at end to average (seconds)
        time_col: Name of time column
        potential_col: Name of potential column

    Returns:
        Steady-state potential in Volts, or None if not found
    """
    if time_col not in df.columns or potential_col not in df.columns:
        return None

    t_max = df[time_col].max()
    if t_max is None:
        return None

    t_start = t_max - window_s
    filtered = df.filter(pl.col(time_col) >= t_start)

    if filtered.height == 0:
        return None

    return float(filtered[potential_col].mean())

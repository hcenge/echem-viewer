"""Technique-specific analysis functions for echem-viewer."""

import polars as pl
import numpy as np


def calculate_time_average(
    df: pl.DataFrame,
    column: str,
    t_start: float,
    t_end: float,
    time_col: str = 'time/s'
) -> float | None:
    """
    Calculate average value over a time range.

    Used for CA (chronoamperometry) and CP (chronopotentiometry) analysis
    to get steady-state current or voltage values.

    Args:
        df: DataFrame with time and value columns
        column: Column to average (e.g., '<I>/mA' for CA, 'Ewe/V' for CP)
        t_start: Start time in seconds
        t_end: End time in seconds
        time_col: Name of time column (default: 'time/s')

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

    return filtered[column].mean()


def find_hf_intercept(df: pl.DataFrame) -> float | None:
    """
    Find high-frequency x-intercept from Nyquist plot (solution/iR resistance).

    For PEIS/EIS data, finds where the -Im(Z) crosses zero at the high-frequency
    end of the spectrum, which corresponds to the solution resistance (R_s).

    Args:
        df: DataFrame with impedance columns (Re(Z)/Ohm and -Im(Z)/Ohm or Im(Z)/Ohm)

    Returns:
        R_solution in Ohms, or None if not found
    """
    re_col = 'Re(Z)/Ohm'

    if re_col not in df.columns:
        return None

    # Handle both -Im(Z)/Ohm (already negated) and Im(Z)/Ohm
    if '-Im(Z)/Ohm' in df.columns:
        re_z = df[re_col].to_numpy()
        im_z = df['-Im(Z)/Ohm'].to_numpy()
    elif 'Im(Z)/Ohm' in df.columns:
        re_z = df[re_col].to_numpy()
        im_z = -df['Im(Z)/Ohm'].to_numpy()
    else:
        return None

    # Sort by Re(Z) to ensure we're looking at high frequency end (small Re values)
    sorted_indices = np.argsort(re_z)
    re_z = re_z[sorted_indices]
    im_z = im_z[sorted_indices]

    # Find where -Im crosses zero (sign change)
    for i in range(len(im_z) - 1):
        if im_z[i] * im_z[i + 1] < 0:
            # Linear interpolation to find x-intercept
            t = -im_z[i] / (im_z[i + 1] - im_z[i])
            return float(re_z[i] + t * (re_z[i + 1] - re_z[i]))

    # Fallback: return smallest Re(Z) where -Im is close to zero
    min_im_idx = np.abs(im_z).argmin()
    if abs(im_z[min_im_idx]) < 1.0:  # Within 1 ohm of zero
        return float(re_z[min_im_idx])

    return None


def get_time_range(df: pl.DataFrame, time_col: str = 'time/s') -> tuple[float, float] | None:
    """
    Get the time range of a DataFrame.

    Args:
        df: DataFrame with time column
        time_col: Name of time column

    Returns:
        Tuple of (min_time, max_time), or None if time column not found
    """
    if time_col not in df.columns:
        return None

    return (df[time_col].min(), df[time_col].max())

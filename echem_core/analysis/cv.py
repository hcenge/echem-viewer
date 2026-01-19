"""Cyclic Voltammetry (CV) analysis functions."""

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


# --- Stubs for future implementation ---

def find_peaks(df: pl.DataFrame) -> list[dict] | None:
    """Find oxidation/reduction peak positions and currents.

    Not implemented - use instrument software.
    """
    raise NotImplementedError("Use instrument software for peak finding")


def peak_separation(df: pl.DataFrame) -> float | None:
    """ΔEp between anodic and cathodic peaks.

    Not implemented - use instrument software.
    """
    raise NotImplementedError("Use instrument software for peak analysis")


def peak_current_ratio(df: pl.DataFrame) -> float | None:
    """Ipa/Ipc ratio.

    Not implemented - use instrument software.
    """
    raise NotImplementedError("Use instrument software for peak analysis")

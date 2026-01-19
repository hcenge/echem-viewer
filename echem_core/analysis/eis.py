"""EIS/PEIS analysis functions."""

import numpy as np
import polars as pl


def find_hf_intercept(df: pl.DataFrame) -> float | None:
    """Find high-frequency x-intercept from Nyquist plot (solution resistance).

    For PEIS/EIS data, finds where the -Im(Z) crosses zero at the high-frequency
    end of the spectrum, which corresponds to the solution resistance (R_s).

    Expects standardized column names:
    - z_real_Ohm: Real impedance
    - z_imag_Ohm: Imaginary impedance

    Args:
        df: DataFrame with impedance columns

    Returns:
        R_solution in Ohms, or None if not found
    """
    if "z_real_Ohm" not in df.columns or "z_imag_Ohm" not in df.columns:
        return None

    re_z = df["z_real_Ohm"].to_numpy()
    im_z = df["z_imag_Ohm"].to_numpy()

    # For Nyquist plots, we typically plot -Im(Z) vs Re(Z)
    # The HF intercept is where -Im(Z) = 0, which means Im(Z) = 0
    neg_im_z = -im_z

    # Sort by Re(Z) to ensure we're looking at high frequency end (small Re values)
    sorted_indices = np.argsort(re_z)
    re_z = re_z[sorted_indices]
    neg_im_z = neg_im_z[sorted_indices]

    # Find where -Im crosses zero (sign change)
    for i in range(len(neg_im_z) - 1):
        if neg_im_z[i] * neg_im_z[i + 1] < 0:
            # Linear interpolation to find x-intercept
            t = -neg_im_z[i] / (neg_im_z[i + 1] - neg_im_z[i])
            return float(re_z[i] + t * (re_z[i + 1] - re_z[i]))

    # Fallback: return smallest Re(Z) where -Im is close to zero
    min_im_idx = np.abs(neg_im_z).argmin()
    if abs(neg_im_z[min_im_idx]) < 1.0:  # Within 1 ohm of zero
        return float(re_z[min_im_idx])

    return None


def find_lf_intercept(df: pl.DataFrame) -> float | None:
    """Find low-frequency x-intercept from Nyquist plot (total resistance).

    For PEIS/EIS data, finds where the -Im(Z) crosses zero at the low-frequency
    end of the spectrum, which corresponds to the total resistance (R_total).

    Expects standardized column names:
    - z_real_Ohm: Real impedance
    - z_imag_Ohm: Imaginary impedance

    Args:
        df: DataFrame with impedance columns

    Returns:
        R_total in Ohms, or None if not found
    """
    if "z_real_Ohm" not in df.columns or "z_imag_Ohm" not in df.columns:
        return None

    re_z = df["z_real_Ohm"].to_numpy()
    im_z = df["z_imag_Ohm"].to_numpy()

    neg_im_z = -im_z

    # Sort by Re(Z) in descending order (low frequency = large Re values)
    sorted_indices = np.argsort(re_z)[::-1]
    re_z = re_z[sorted_indices]
    neg_im_z = neg_im_z[sorted_indices]

    # Find where -Im crosses zero (sign change)
    for i in range(len(neg_im_z) - 1):
        if neg_im_z[i] * neg_im_z[i + 1] < 0:
            # Linear interpolation to find x-intercept
            t = -neg_im_z[i] / (neg_im_z[i + 1] - neg_im_z[i])
            return float(re_z[i] + t * (re_z[i + 1] - re_z[i]))

    # Fallback: return largest Re(Z) where -Im is close to zero
    min_im_idx = np.abs(neg_im_z).argmin()
    if abs(neg_im_z[min_im_idx]) < 1.0:  # Within 1 ohm of zero
        return float(re_z[min_im_idx])

    return None

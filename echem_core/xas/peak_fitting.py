"""
Lorentzian peak fitting for second derivative XAS analysis.

Used for fitting peaks in the second derivative of normalized XAS data
to precisely determine edge positions.
"""

from dataclasses import dataclass
from typing import Optional
import numpy as np
from scipy.optimize import curve_fit


@dataclass
class PeakFitResult:
    """Result of Lorentzian peak fitting."""
    success: bool
    n_peaks: int
    params: dict[str, dict]  # {peak_1: {A, x0, gamma}, ...}
    energy_fit: np.ndarray  # Energy range used for fitting
    fit_curve: np.ndarray  # Fitted curve
    r_squared: float
    error: Optional[str]

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            "success": self.success,
            "n_peaks": self.n_peaks,
            "params": self.params,
            "energy_fit": self.energy_fit.tolist() if self.energy_fit is not None else None,
            "fit_curve": self.fit_curve.tolist() if self.fit_curve is not None else None,
            "r_squared": float(self.r_squared) if self.r_squared is not None else None,
            "error": self.error,
        }


def lorentzian_d2(x: np.ndarray, *params) -> np.ndarray:
    """
    Multi-Lorentzian second derivative function.

    The second derivative of a Lorentzian peak L(x) = A * gamma^2 / ((x-x0)^2 + gamma^2)
    has the form used here for fitting d²μ/dE² data.

    Parameters
    ----------
    x : np.ndarray
        Energy values
    *params : float
        Flattened parameters: [A1, x0_1, gamma1, A2, x0_2, gamma2, ...]
        For each peak: A (amplitude), x0 (center), gamma (width)

    Returns
    -------
    np.ndarray
        Sum of Lorentzian second derivatives
    """
    result = np.zeros_like(x, dtype=float)
    n_peaks = len(params) // 3

    for j in range(n_peaks):
        A = params[j * 3]
        x0 = params[j * 3 + 1]
        gamma = params[j * 3 + 2]

        # Second derivative of Lorentzian
        # d²L/dx² = 2*A*gamma² * (3*(x-x0)² - gamma²) / ((x-x0)² + gamma²)³
        diff = x - x0
        term = diff**2 + gamma**2
        numerator = 2 * A * gamma**2 * (3 * diff**2 - gamma**2)
        denominator = gamma**4 * term**3
        result += numerator / denominator

    return result


def fit_peaks(
    energy: np.ndarray,
    d2mu: np.ndarray,
    n_peaks: int,
    initial_guesses: list[dict],
    energy_range: tuple[float, float],
) -> PeakFitResult:
    """
    Fit Lorentzian peaks to second derivative data.

    Parameters
    ----------
    energy : np.ndarray
        Energy array in eV
    d2mu : np.ndarray
        Second derivative of normalized absorption
    n_peaks : int
        Number of peaks to fit (1-4)
    initial_guesses : list[dict]
        Initial guesses for each peak. Each dict should have:
        - A: amplitude (negative for minima)
        - x0: center energy (eV)
        - gamma: width parameter
    energy_range : tuple[float, float]
        (E_min, E_max) range for fitting in eV

    Returns
    -------
    PeakFitResult
        Fitting results including parameters and quality metrics
    """
    if n_peaks < 1 or n_peaks > 4:
        return PeakFitResult(
            success=False,
            n_peaks=n_peaks,
            params={},
            energy_fit=None,
            fit_curve=None,
            r_squared=None,
            error="n_peaks must be between 1 and 4",
        )

    if len(initial_guesses) != n_peaks:
        return PeakFitResult(
            success=False,
            n_peaks=n_peaks,
            params={},
            energy_fit=None,
            fit_curve=None,
            r_squared=None,
            error=f"Expected {n_peaks} initial guesses, got {len(initial_guesses)}",
        )

    # Apply energy range filter
    mask = (energy >= energy_range[0]) & (energy <= energy_range[1])
    energy_fit = energy[mask]
    d2mu_fit = d2mu[mask]

    if len(energy_fit) < 3 * n_peaks:
        return PeakFitResult(
            success=False,
            n_peaks=n_peaks,
            params={},
            energy_fit=None,
            fit_curve=None,
            r_squared=None,
            error="Not enough data points in energy range for fitting",
        )

    # Build initial parameters and bounds
    initial_params = []
    lower_bounds = []
    upper_bounds = []

    for guess in initial_guesses:
        initial_params.extend([guess["A"], guess["x0"], guess["gamma"]])
        # Bounds: A can be any sign, x0 within energy range, gamma > 0
        lower_bounds.extend([-np.inf, float(energy_fit.min()), 0.1])
        upper_bounds.extend([np.inf, float(energy_fit.max()), 50])

    try:
        popt, _ = curve_fit(
            lorentzian_d2,
            energy_fit,
            d2mu_fit,
            p0=initial_params,
            bounds=(lower_bounds, upper_bounds),
            maxfev=5000,
        )

        # Calculate fit quality
        fit_curve = lorentzian_d2(energy_fit, *popt)
        residual = d2mu_fit - fit_curve
        ss_res = np.sum(residual**2)
        ss_tot = np.sum((d2mu_fit - np.mean(d2mu_fit))**2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        # Extract parameters into dict
        params_dict = {}
        for i in range(n_peaks):
            params_dict[f"peak_{i+1}"] = {
                "A": float(popt[i * 3]),
                "x0": float(popt[i * 3 + 1]),
                "gamma": float(popt[i * 3 + 2]),
            }

        return PeakFitResult(
            success=True,
            n_peaks=n_peaks,
            params=params_dict,
            energy_fit=energy_fit,
            fit_curve=fit_curve,
            r_squared=r_squared,
            error=None,
        )

    except Exception as e:
        return PeakFitResult(
            success=False,
            n_peaks=n_peaks,
            params={},
            energy_fit=energy_fit,
            fit_curve=None,
            r_squared=None,
            error=str(e),
        )


def estimate_initial_guesses(
    energy: np.ndarray,
    d2mu: np.ndarray,
    n_peaks: int = 1,
) -> list[dict]:
    """
    Estimate initial guesses for peak fitting based on data.

    Parameters
    ----------
    energy : np.ndarray
        Energy array in eV
    d2mu : np.ndarray
        Second derivative data
    n_peaks : int
        Number of peaks to estimate

    Returns
    -------
    list[dict]
        Initial guesses for each peak
    """
    guesses = []

    # Find global minimum as primary peak
    min_idx = np.argmin(d2mu)
    min_A = float(d2mu[min_idx])
    min_x0 = float(energy[min_idx])

    # Estimate width from half-height points
    half_height = min_A / 2
    above_half = d2mu > half_height
    if np.any(above_half):
        # Find approximate FWHM
        left_idx = np.argmax(above_half[:min_idx][::-1])
        right_idx = np.argmax(above_half[min_idx:])
        fwhm = energy[min_idx + right_idx] - energy[min_idx - left_idx]
        gamma = max(fwhm / 2, 1.0)
    else:
        gamma = 5.0  # Default width

    guesses.append({"A": min_A, "x0": min_x0, "gamma": gamma})

    # For additional peaks, space them out from the main peak
    for i in range(1, n_peaks):
        offset = (i * 5)  # 5 eV spacing
        guesses.append({
            "A": min_A * 0.5,  # Smaller amplitude
            "x0": min_x0 + offset,
            "gamma": gamma,
        })

    return guesses

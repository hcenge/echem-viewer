"""
XAS data processing functions.

Core functions for:
- Single scan normalization with optional energy alignment
- Dataset averaging
- Derivative calculation
"""

from dataclasses import dataclass
from typing import Optional
import numpy as np
import h5py
from larch import Group
from larch.xafs import pre_edge


@dataclass
class NormalizedScan:
    """Result of normalizing a single XAS scan."""
    energy: np.ndarray  # Energy in eV
    mu: np.ndarray  # Raw absorption
    norm: np.ndarray  # Normalized absorption
    e0: float  # Edge energy in eV
    edge_step: float  # Edge step height
    pre_edge_line: np.ndarray  # Pre-edge fit line
    post_edge_line: np.ndarray  # Post-edge fit line
    pre1: float  # Pre-edge range start (relative to E0)
    pre2: float  # Pre-edge range end (relative to E0)
    norm1: float  # Post-edge range start (relative to E0)
    norm2: float  # Post-edge range end (relative to E0)
    aligned: bool  # Whether energy alignment was applied
    energy_shift_applied: float  # Energy shift applied (eV)
    e0_before_alignment: Optional[float]  # E0 before alignment (if aligned)

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict matching frontend NormalizedScan type."""
        return {
            "energy_eV": self.energy.tolist(),
            "mu_raw": self.mu.tolist(),
            "mu_norm": self.norm.tolist(),
            "mu_pre": self.pre_edge_line.tolist(),
            "mu_post": self.post_edge_line.tolist(),
            "e0": float(self.e0),
            "edge_step": float(self.edge_step),
            "pre_slope": 0.0,  # TODO: extract from larch if needed
            "pre_offset": 0.0,  # TODO: extract from larch if needed
            "pre1": float(self.pre1),
            "pre2": float(self.pre2),
            "norm1": float(self.norm1),
            "norm2": float(self.norm2),
            "aligned": self.aligned,
            "energy_shift_applied": float(self.energy_shift_applied),
            "e0_before_alignment": float(self.e0_before_alignment) if self.e0_before_alignment else None,
        }


@dataclass
class AveragedData:
    """Result of averaging multiple scans."""
    energy: np.ndarray
    norm: np.ndarray
    std: np.ndarray  # Standard deviation at each energy point
    e0: float
    n_scans: int
    scan_list: list[str]
    individual_norms: Optional[list[np.ndarray]] = None  # For quality analysis

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        return {
            "energy": self.energy.tolist(),
            "norm": self.norm.tolist(),
            "std": self.std.tolist(),
            "e0": float(self.e0),
            "n_scans": self.n_scans,
            "scan_list": self.scan_list,
        }

    def mean_std(self) -> float:
        """Return mean standard deviation across all energy points."""
        return float(np.mean(self.std))

    def contribution_analysis(self) -> list[dict]:
        """
        Analyze how each scan contributes to the overall standard deviation.

        Returns list of {scan_key, mean_std_without, improvement} for each scan,
        where improvement > 0 means removing the scan would reduce std.
        """
        if self.individual_norms is None or len(self.individual_norms) < 2:
            return []

        baseline_std = self.mean_std()
        contributions = []

        for i, scan_key in enumerate(self.scan_list):
            # Calculate std without this scan
            other_norms = [n for j, n in enumerate(self.individual_norms) if j != i]
            if len(other_norms) > 0:
                std_without = np.std(other_norms, axis=0)
                mean_std_without = float(np.mean(std_without))
                improvement = baseline_std - mean_std_without
            else:
                mean_std_without = 0.0
                improvement = 0.0

            contributions.append({
                "scan_key": scan_key,
                "mean_std_without": mean_std_without,
                "improvement": improvement,  # positive = removing helps
            })

        return contributions


def normalize_single_scan(
    h5filename: str,
    scan_key: str,
    numerator: str,
    denominator: Optional[str] = None,
    pre1: Optional[float] = None,
    pre2: Optional[float] = None,
    norm1: Optional[float] = None,
    norm2: Optional[float] = None,
    energy_min: Optional[float] = None,
    energy_max: Optional[float] = None,
    energy_shift: Optional[float] = None,
    h5_paths: Optional[dict] = None,
    parent_path: str = "instrument",
) -> NormalizedScan:
    """
    Normalize a single scan from an H5 file with optional energy alignment.

    Parameters
    ----------
    h5filename : str
        Path to H5 file
    scan_key : str
        Scan key (e.g., '1.1')
    numerator : str
        Numerator channel name (key in h5_paths)
    denominator : str, optional
        Denominator channel name (key in h5_paths)
    pre1, pre2 : float, optional
        Pre-edge range relative to E0 (eV). If None, Larch auto-detects.
    norm1, norm2 : float, optional
        Post-edge range relative to E0 (eV). If None, Larch auto-detects.
    energy_min, energy_max : float, optional
        Energy filtering range in keV
    energy_shift : float, optional
        Energy shift to apply (in eV) for calibration.
    h5_paths : dict
        Mapping of channel names to H5 dataset paths.
        Must include "energy" key and keys matching numerator/denominator.
    parent_path : str
        Parent path within H5 file (default: "instrument")

    Returns
    -------
    NormalizedScan
        Dataclass with all normalization results

    Raises
    ------
    ValueError
        If required data is missing or invalid
    """
    if h5_paths is None:
        raise ValueError("h5_paths mapping is required")

    # Read data from H5 file
    with h5py.File(h5filename, "r") as f:
        if scan_key not in f:
            raise ValueError(f"Scan {scan_key} not found in file")

        scan_group = f[scan_key]
        if parent_path not in scan_group:
            raise ValueError(f"Parent path '{parent_path}' not found in scan {scan_key}")

        instrument = scan_group[parent_path]

        # Check required paths exist
        if h5_paths["energy"] not in instrument:
            raise ValueError(f"Energy data not found in scan {scan_key}")
        if h5_paths[numerator] not in instrument:
            raise ValueError(f"Numerator '{numerator}' not found in scan {scan_key}")
        if denominator and h5_paths.get(denominator) not in instrument:
            raise ValueError(f"Denominator '{denominator}' not found in scan {scan_key}")

        # Read energy and signal data
        energy_raw = instrument[h5_paths["energy"]]["data"][:]
        numerator_data = instrument[h5_paths[numerator]]["data"][:]

        # Apply denominator if specified
        if denominator:
            denominator_data = instrument[h5_paths[denominator]]["data"][:]
            mu_raw = numerator_data / denominator_data
        else:
            mu_raw = numerator_data

    # Apply energy filtering if specified
    if energy_min is not None or energy_max is not None:
        mask = np.ones(len(energy_raw), dtype=bool)
        if energy_min is not None:
            mask &= energy_raw >= energy_min
        if energy_max is not None:
            mask &= energy_raw <= energy_max
        energy_raw = energy_raw[mask]
        mu_raw = mu_raw[mask]

        if len(energy_raw) == 0:
            raise ValueError(
                f"Energy filtering removed all data. "
                f"Check energy_min ({energy_min}) and energy_max ({energy_max}) values."
            )

    # Convert keV to eV
    energy_eV = energy_raw * 1000

    # Apply energy shift if provided
    e0_before_alignment = None
    if energy_shift is not None and energy_shift != 0:
        # First pass: find E0 before alignment
        dat_temp = Group()
        dat_temp.energy = energy_eV.copy()
        dat_temp.mu = mu_raw.copy()
        pre_edge(dat_temp, group=dat_temp, pre1=pre1, pre2=pre2, norm1=norm1, norm2=norm2)
        e0_before_alignment = float(dat_temp.e0)

        # Apply energy shift
        energy_eV = energy_eV + energy_shift
        aligned = True
    else:
        aligned = False
        energy_shift = 0.0

    # Normalize using Larch
    dat = Group()
    dat.energy = energy_eV
    dat.mu = mu_raw
    pre_edge(dat, group=dat, pre1=pre1, pre2=pre2, norm1=norm1, norm2=norm2)

    # Extract actual parameters used (Larch may have auto-detected)
    actual_pre1 = float(dat.pre_edge_details.pre1)
    actual_pre2 = float(dat.pre_edge_details.pre2)
    actual_norm1 = float(dat.pre_edge_details.norm1)
    actual_norm2 = float(dat.pre_edge_details.norm2)

    return NormalizedScan(
        energy=dat.energy,
        mu=dat.mu,
        norm=dat.norm,
        e0=float(dat.e0),
        edge_step=float(dat.edge_step),
        pre_edge_line=dat.pre_edge,
        post_edge_line=dat.post_edge,
        pre1=actual_pre1,
        pre2=actual_pre2,
        norm1=actual_norm1,
        norm2=actual_norm2,
        aligned=aligned,
        energy_shift_applied=float(energy_shift),
        e0_before_alignment=e0_before_alignment,
    )


def average_scans_for_dataset(
    h5_file: str,
    scan_params_dict: dict[str, dict],
    numerator: str,
    denominator: Optional[str] = None,
    energy_min: Optional[float] = None,
    energy_max: Optional[float] = None,
    h5_paths: Optional[dict] = None,
    parent_path: str = "instrument",
) -> Optional[AveragedData]:
    """
    Average all 'good' scans for a dataset using saved normalization parameters.

    Parameters
    ----------
    h5_file : str
        Path to H5 file
    scan_params_dict : dict
        Dict of scan_key -> params dict. Each params dict should have:
        - pre1, pre2, norm1, norm2: normalization parameters
        - status: 'good', 'ignore', or 'unreviewed'
        Only scans with status='good' will be averaged.
    numerator : str
        Numerator channel name
    denominator : str, optional
        Denominator channel name
    energy_min, energy_max : float, optional
        Energy filtering range in keV
    h5_paths : dict
        Mapping of channel names to H5 dataset paths
    parent_path : str
        Parent path within H5 file

    Returns
    -------
    AveragedData or None
        Averaged data, or None if no good scans found
    """
    if h5_paths is None:
        raise ValueError("h5_paths mapping is required")

    # Filter for 'good' scans only
    good_scans = [
        scan_key
        for scan_key, params in scan_params_dict.items()
        if params.get("status") == "good"
    ]

    if not good_scans:
        return None

    # Normalize each scan and collect results
    normalized_scans = []
    for scan_key in good_scans:
        try:
            scan_params = scan_params_dict[scan_key]
            result = normalize_single_scan(
                h5_file,
                scan_key,
                numerator,
                denominator,
                pre1=scan_params.get("pre1"),
                pre2=scan_params.get("pre2"),
                norm1=scan_params.get("norm1"),
                norm2=scan_params.get("norm2"),
                energy_min=energy_min,
                energy_max=energy_max,
                energy_shift=scan_params.get("energy_shift"),
                h5_paths=h5_paths,
                parent_path=parent_path,
            )
            normalized_scans.append({
                "scan_key": scan_key,
                "energy": result.energy,
                "norm": result.norm,
                "e0": result.e0,
            })
        except Exception as e:
            # Log but continue with other scans
            print(f"WARNING: Failed to normalize scan {scan_key}: {e}")
            continue

    if not normalized_scans:
        return None

    # Average the normalized scans
    # Use energy grid from first scan (all should be on same grid)
    avg_energy = normalized_scans[0]["energy"]

    # Collect all normalized arrays for stats
    all_norms = [scan["norm"] for scan in normalized_scans]
    avg_norm = np.mean(all_norms, axis=0)

    # Calculate standard deviation at each energy point
    if len(all_norms) > 1:
        avg_std = np.std(all_norms, axis=0)
    else:
        avg_std = np.zeros_like(avg_norm)

    avg_e0 = np.mean([scan["e0"] for scan in normalized_scans])

    return AveragedData(
        energy=avg_energy,
        norm=avg_norm,
        std=avg_std,
        e0=float(avg_e0),
        n_scans=len(normalized_scans),
        scan_list=[scan["scan_key"] for scan in normalized_scans],
        individual_norms=all_norms,  # Store for quality analysis
    )


def calculate_derivative(
    energy: np.ndarray,
    data: np.ndarray,
    order: int = 1,
    smoothing_window: int = 1,
) -> np.ndarray:
    """
    Calculate derivative of XAS data.

    Parameters
    ----------
    energy : np.ndarray
        Energy array in eV
    data : np.ndarray
        Data array (mu or norm)
    order : int
        Derivative order (1 or 2)
    smoothing_window : int
        Window size for moving average smoothing. Use 1 for no smoothing.

    Returns
    -------
    np.ndarray
        Derivative array
    """
    if order not in (1, 2):
        raise ValueError("order must be 1 or 2")

    # Calculate energy step for gradient
    dE = np.mean(np.diff(energy))

    # First derivative
    deriv = np.gradient(data, dE)

    # Second derivative if requested
    if order == 2:
        deriv = np.gradient(deriv, dE)

    # Apply smoothing if window > 1
    if smoothing_window > 1:
        kernel = np.ones(smoothing_window) / smoothing_window
        deriv = np.convolve(deriv, kernel, mode="same")

    return deriv

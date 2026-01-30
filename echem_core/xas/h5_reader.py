"""
H5 file reading utilities for XAS data.

Functions for:
- Scanning directories for H5 files and building sample/dataset index
- Finding valid scans within H5 files
- Reading raw scan data
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import h5py
import numpy as np


@dataclass
class DatasetInfo:
    """Information about a dataset (folder containing H5 files)."""
    sample: str
    dataset: str
    h5_files: list[str]  # Relative paths from project root
    valid_scans: Optional[list[str]]  # Cached list of valid scan IDs


def scan_h5_for_datasets(
    project_path: str | Path,
    raw_data_folders: list[str] = None,
) -> list[DatasetInfo]:
    """
    Scan project folder for H5 files and build sample/dataset index.

    Expected folder structure:
        project_path/
        ├── raw_data_folder/
        │   ├── SampleA/
        │   │   ├── Dataset1/
        │   │   │   ├── scan_001.h5
        │   │   │   └── scan_002.h5
        │   │   └── Dataset2/
        │   │       └── scan_001.h5
        │   └── SampleB/
        │       └── ...

    Parameters
    ----------
    project_path : str or Path
        Root path of the project
    raw_data_folders : list[str], optional
        List of folder names to search for raw data.
        Defaults to searching the project root directly.

    Returns
    -------
    list[DatasetInfo]
        List of discovered datasets with their H5 files
    """
    project_path = Path(project_path)
    datasets = []

    # Determine which folders to scan
    if raw_data_folders:
        search_roots = [project_path / folder for folder in raw_data_folders]
    else:
        search_roots = [project_path]

    for search_root in search_roots:
        if not search_root.exists():
            continue

        # Iterate through sample folders
        for sample_folder in sorted(search_root.iterdir()):
            if not sample_folder.is_dir():
                continue

            sample_name = sample_folder.name

            # Iterate through dataset folders
            for dataset_folder in sorted(sample_folder.iterdir()):
                if not dataset_folder.is_dir():
                    continue

                dataset_name = dataset_folder.name

                # Find H5 files in this dataset
                h5_files = sorted(dataset_folder.glob("*.h5"))
                if h5_files:
                    # Store paths relative to project root
                    relative_paths = [
                        str(f.relative_to(project_path)) for f in h5_files
                    ]
                    datasets.append(DatasetInfo(
                        sample=sample_name,
                        dataset=dataset_name,
                        h5_files=relative_paths,
                        valid_scans=None,  # Will be populated on demand
                    ))

    return datasets


def find_valid_scans(
    h5_file: str | Path,
    h5_paths: dict,
    parent_path: str = "instrument",
    numerator: Optional[str] = None,
) -> list[str]:
    """
    Find valid scan IDs in an H5 file.

    A scan is valid if it contains the required energy data.
    Optionally checks for numerator data as well.

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file
    h5_paths : dict
        Mapping of channel names to H5 dataset paths.
        Must include "energy" key.
    parent_path : str
        Parent path within H5 file (default: "instrument")
    numerator : str, optional
        If provided, also check that numerator data exists

    Returns
    -------
    list[str]
        List of valid scan IDs (e.g., ["1.1", "1.2", "2.1"])
    """
    valid_scans = []

    with h5py.File(h5_file, "r") as f:
        for scan_key in f.keys():
            try:
                # Check if this is a scan group
                if not isinstance(f[scan_key], h5py.Group):
                    continue

                # Check for instrument group
                if parent_path not in f[scan_key]:
                    continue

                instrument = f[scan_key][parent_path]

                # Check for energy data
                if h5_paths["energy"] not in instrument:
                    continue

                # Optionally check for numerator
                if numerator and h5_paths.get(numerator) not in instrument:
                    continue

                valid_scans.append(scan_key)

            except Exception:
                # Skip problematic entries
                continue

    # Sort scans naturally (1.1, 1.2, ..., 2.1, 2.2, ...)
    def scan_sort_key(s):
        try:
            parts = s.split(".")
            return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
        except (ValueError, IndexError):
            return (999, 0)

    return sorted(valid_scans, key=scan_sort_key)


def read_scan_data(
    h5_file: str | Path,
    scan_key: str,
    numerator: str,
    denominator: Optional[str],
    h5_paths: dict,
    parent_path: str = "instrument",
    energy_min: Optional[float] = None,
    energy_max: Optional[float] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Read raw scan data from H5 file.

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file
    scan_key : str
        Scan ID (e.g., "1.1")
    numerator : str
        Numerator channel name (key in h5_paths)
    denominator : str, optional
        Denominator channel name (key in h5_paths)
    h5_paths : dict
        Mapping of channel names to H5 dataset paths
    parent_path : str
        Parent path within H5 file
    energy_min, energy_max : float, optional
        Energy filtering range in keV

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        (energy_eV, mu) arrays
    """
    with h5py.File(h5_file, "r") as f:
        instrument = f[scan_key][parent_path]

        # Read energy (keV)
        energy_raw = instrument[h5_paths["energy"]]["data"][:]

        # Read numerator
        numerator_data = instrument[h5_paths[numerator]]["data"][:]

        # Apply denominator if specified
        if denominator:
            denominator_data = instrument[h5_paths[denominator]]["data"][:]
            mu_raw = numerator_data / denominator_data
        else:
            mu_raw = numerator_data

    # Apply energy filtering
    if energy_min is not None or energy_max is not None:
        mask = np.ones(len(energy_raw), dtype=bool)
        if energy_min is not None:
            mask &= energy_raw >= energy_min
        if energy_max is not None:
            mask &= energy_raw <= energy_max
        energy_raw = energy_raw[mask]
        mu_raw = mu_raw[mask]

    # Convert to eV
    energy_eV = energy_raw * 1000

    return energy_eV, mu_raw


# Default H5 paths configuration for ESRF BM23
BM23_H5_PATHS = {
    "energy": "energy_enc",
    "I0": "I0",
    "Ir_Pt_corr": "Ir_Pt_corr_det00",
    "Pt_corr": "Pt_corr_det00",
    "Ir2_corr": "Ir2_corr_det00",
    "Mn_corr": "Mn_corr_det00",
    "mu_roi": "mu_roi",
    "Co2_corr": "Co2_corr_det00",
}

# Beamline configurations
BEAMLINE_CONFIGS = {
    "BM23": {
        "h5_paths": BM23_H5_PATHS,
        "parent_path": "instrument",
    },
}

"""
H5 file reading utilities for XAS data.

Functions for:
- Scanning directories for H5 files and building sample/dataset index
- Finding valid scans within H5 files
- Reading raw scan data
- Safe expression evaluation on H5 channel data
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import re
import h5py
import numpy as np


# Whitelist of safe numpy functions for expression evaluation (no np. prefix needed)
SAFE_NUMPY_FUNCS = {
    # Basic math
    'abs': np.abs,
    'sign': np.sign,
    'sqrt': np.sqrt,
    'square': np.square,
    'power': np.power,
    # Trig
    'sin': np.sin,
    'cos': np.cos,
    'tan': np.tan,
    'arcsin': np.arcsin,
    'arccos': np.arccos,
    'arctan': np.arctan,
    'sinh': np.sinh,
    'cosh': np.cosh,
    'tanh': np.tanh,
    # Exponential/log
    'exp': np.exp,
    'log': np.log,
    'log10': np.log10,
    'log2': np.log2,
    'expm1': np.expm1,
    'log1p': np.log1p,
    # Rounding
    'floor': np.floor,
    'ceil': np.ceil,
    'round': np.round,
    'trunc': np.trunc,
    # Constants
    'pi': np.pi,
    'e': np.e,
}


def extract_channel_paths(expression: str, available_channels: set[str]) -> list[str]:
    """
    Extract channel paths referenced in an expression.

    Supports both full paths (instrument/energy_enc) and short names (energy_enc).
    Full paths use underscore as separator in the expression for eval compatibility.

    Parameters
    ----------
    expression : str
        Mathematical expression that may contain channel paths
    available_channels : set[str]
        Set of valid channel paths (e.g., "instrument/energy_enc")

    Returns
    -------
    list[str]
        List of channel paths found in the expression
    """
    # Build lookup for both full paths and short names
    # Full paths in expression use underscore: instrument__energy_enc
    path_lookup = {}
    short_name_lookup = {}  # short name -> list of full paths (for ambiguity check)

    for ch in available_channels:
        if '/' in ch:
            # Full path like "instrument/energy_enc"
            expr_name = ch.replace('/', '__')  # Convert to valid Python identifier
            path_lookup[expr_name] = ch
            # Also track short name
            short_name = ch.split('/')[-1]
            if short_name not in short_name_lookup:
                short_name_lookup[short_name] = []
            short_name_lookup[short_name].append(ch)
        else:
            path_lookup[ch] = ch
            short_name_lookup[ch] = [ch]

    # Find all word tokens (potential channel names)
    # Match both simple names and double-underscore paths
    tokens = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*(?:__[a-zA-Z_][a-zA-Z0-9_]*)*\b', expression)

    referenced = []
    for token in tokens:
        if token in SAFE_NUMPY_FUNCS:
            continue
        if token in path_lookup:
            referenced.append(path_lookup[token])
        elif token in short_name_lookup:
            # Short name - use it if unambiguous
            paths = short_name_lookup[token]
            if len(paths) == 1:
                referenced.append(paths[0])
            # If ambiguous, skip (will cause error later)

    return list(dict.fromkeys(referenced))  # Dedupe while preserving order


def evaluate_expression(
    h5_file: str | Path,
    scan_key: str,
    expression: str,
    available_channels: list[str],
) -> np.ndarray:
    """
    Safely evaluate a numpy expression using H5 channel data.

    Channel references can be:
    - Full paths with double underscore: instrument__energy_enc
    - Short names (if unambiguous): energy_enc

    Only loads channels that are actually referenced in the expression.
    Uses a restricted namespace with whitelisted numpy functions only.

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file
    scan_key : str
        Scan ID (e.g., "1.1")
    expression : str
        Math expression using channel paths as variables.
        Use double underscore for paths: log(instrument__Ir_corr / instrument__I0)
        Or short names if unambiguous: log(Ir_corr / I0)
    available_channels : list[str]
        List of valid channel paths (e.g., ["instrument/energy_enc", "instrument/I0"])

    Returns
    -------
    np.ndarray
        Result of evaluating the expression

    Raises
    ------
    ValueError
        If no valid channels found or expression evaluation fails
    """
    # Find which channels are referenced
    channel_set = set(available_channels)
    referenced = extract_channel_paths(expression, channel_set)

    if not referenced:
        raise ValueError(f"No valid channel names found in expression: {expression}")

    # Build namespace with safe functions (available directly, no np. prefix)
    namespace = SAFE_NUMPY_FUNCS.copy()

    # Load only referenced channels
    with h5py.File(h5_file, "r") as f:
        scan_group = f[scan_key]

        for channel_path in referenced:
            # Parse path: "parent/channel" or just "channel"
            if '/' in channel_path:
                parent_path, channel_name = channel_path.split('/', 1)
            else:
                # Find the channel in any parent path
                channel_name = channel_path
                parent_path = None
                for key in scan_group.keys():
                    if isinstance(scan_group[key], h5py.Group) and channel_name in scan_group[key]:
                        parent_path = key
                        break
                if parent_path is None:
                    raise ValueError(f"Channel '{channel_name}' not found in any parent path")

            base = scan_group[parent_path]
            if channel_name not in base:
                raise ValueError(f"Channel '{channel_path}' not found")

            item = base[channel_name]
            # Handle Group/data structure vs direct Dataset
            if isinstance(item, h5py.Group) and "data" in item:
                data_item = item["data"]
            else:
                data_item = item

            # Handle scalar vs array
            if data_item.shape == ():
                value = float(data_item[()])
            else:
                value = np.array(data_item[:])

            # Add to namespace with both full path name and short name
            expr_name = channel_path.replace('/', '__')
            namespace[expr_name] = value
            # Also add short name if not already taken
            if channel_name not in namespace:
                namespace[channel_name] = value

    # Evaluate with restricted namespace (no builtins for security)
    try:
        result = eval(expression, {"__builtins__": {}}, namespace)
        return np.asarray(result)
    except Exception as e:
        raise ValueError(f"Expression evaluation failed: {e}")


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


def get_h5_channels(h5_file: str | Path) -> dict:
    """
    Get available parent paths and channels from H5 file.

    Reads the structure of the first scan in the H5 file to discover
    available data channels. This is used for the direct view mode
    where users can select any channels without predefined ROI configs.

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file

    Returns
    -------
    dict
        {
            "parent_paths": ["instrument", "measurement", ...],
            "channels": {
                "instrument": ["I0", "energy_enc", ...],
                "measurement": [...],
            }
        }
    """
    with h5py.File(h5_file, "r") as f:
        # Get the first scan key
        scan_keys = [k for k in f.keys() if isinstance(f[k], h5py.Group)]
        if not scan_keys:
            return {"parent_paths": [], "channels": {}}

        first_scan = scan_keys[0]

        # Find parent paths (groups within the scan)
        parent_paths = [
            k for k in f[first_scan].keys()
            if isinstance(f[first_scan][k], h5py.Group)
        ]

        # Get channels for each parent path
        channels = {}
        for parent in parent_paths:
            parent_group = f[first_scan][parent]
            # Get datasets/groups within this parent
            channel_names = []
            for name in parent_group.keys():
                item = parent_group[name]
                # Include if it's a group containing 'data' or a direct dataset
                if isinstance(item, h5py.Group) and "data" in item:
                    channel_names.append(name)
                elif isinstance(item, h5py.Dataset):
                    channel_names.append(name)
            channels[parent] = sorted(channel_names)

        return {"parent_paths": sorted(parent_paths), "channels": channels}


def read_direct_channels(
    h5_file: str | Path,
    scan_key: str,
    parent_path: str,
    x_channel: str,
    y_channel: str,
    x_denominator: Optional[str] = None,
    y_denominator: Optional[str] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Read raw X/Y data from specified H5 channels.

    This is used for direct view mode where users select channels
    manually rather than using predefined ROI configurations.

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file
    scan_key : str
        Scan ID (e.g., "1.1")
    parent_path : str
        Parent path within H5 file (e.g., "instrument")
    x_channel : str
        Channel name for X axis (typically energy)
    y_channel : str
        Channel name for Y axis (signal)
    x_denominator : str, optional
        Channel name to divide X by
    y_denominator : str, optional
        Channel name to divide Y by (e.g., "I0")

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        (x_data, y_data) arrays
    """
    def read_channel(base, channel_name: str) -> np.ndarray:
        """Read a single channel, handling both Group/data and Dataset structures."""
        item = base[channel_name]
        if isinstance(item, h5py.Group) and "data" in item:
            data_item = item["data"]
        else:
            data_item = item

        # Handle scalar vs array datasets
        if data_item.shape == ():
            # Scalar - return as single-element array
            return np.array([float(data_item[()])])
        else:
            return np.array(data_item[:])

    with h5py.File(h5_file, "r") as f:
        base = f[scan_key][parent_path]

        # Read X data
        x_data = read_channel(base, x_channel)

        # Apply X denominator if specified
        if x_denominator:
            x_denom_data = read_channel(base, x_denominator)
            x_data = x_data / x_denom_data

        # Read Y data
        y_data = read_channel(base, y_channel)

        # Apply Y denominator if specified
        if y_denominator:
            y_denom_data = read_channel(base, y_denominator)
            y_data = y_data / y_denom_data

    return x_data, y_data


def read_custom_expression(
    h5_file: str | Path,
    scan_key: str,
    parent_path: str,
    expression: str,
) -> np.ndarray:
    """
    Evaluate a custom mathematical expression using H5 channel data.

    The expression can use any channel name as a variable. Supports
    basic math operations (+, -, *, /, **) and numpy functions
    (sin, cos, exp, log, sqrt, abs).

    Parameters
    ----------
    h5_file : str or Path
        Path to H5 file
    scan_key : str
        Scan ID (e.g., "1.1")
    parent_path : str
        Parent path within H5 file (e.g., "instrument")
    expression : str
        Math expression using channel names as variables
        e.g., "energy_enc * 1000" or "(Ir_corr - Pt_corr) / I0"

    Returns
    -------
    np.ndarray
        Result of evaluating the expression
    """
    with h5py.File(h5_file, "r") as f:
        base = f[scan_key][parent_path]

        # Build namespace with all available channels
        namespace = {
            # Safe numpy functions
            "sin": np.sin,
            "cos": np.cos,
            "tan": np.tan,
            "exp": np.exp,
            "log": np.log,
            "log10": np.log10,
            "sqrt": np.sqrt,
            "abs": np.abs,
            "pi": np.pi,
            "e": np.e,
        }

        # Add all channels as variables
        for channel_name in base.keys():
            item = base[channel_name]
            try:
                if isinstance(item, h5py.Group) and "data" in item:
                    data_item = item["data"]
                    # Handle scalar vs array datasets
                    if data_item.shape == ():
                        namespace[channel_name] = float(data_item[()])
                    else:
                        namespace[channel_name] = np.array(data_item[:])
                elif isinstance(item, h5py.Dataset):
                    # Handle scalar vs array datasets
                    if item.shape == ():
                        namespace[channel_name] = float(item[()])
                    else:
                        namespace[channel_name] = np.array(item[:])
            except Exception:
                # Skip channels that can't be read as numeric data
                pass

        # Evaluate expression safely
        try:
            # Use numexpr if available (faster and safer)
            try:
                import numexpr as ne
                result = ne.evaluate(expression, local_dict=namespace)
            except ImportError:
                # Fall back to eval with restricted namespace
                result = eval(expression, {"__builtins__": {}}, namespace)
            return np.asarray(result)
        except Exception as e:
            raise ValueError(f"Failed to evaluate expression '{expression}': {e}")


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

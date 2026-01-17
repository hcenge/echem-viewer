"""BioLogic .mpr file support for echem-viewer."""

import re
import os
import tempfile
import polars as pl
from galvani import BioLogic

# Map full technique names from Biologic to abbreviations
TECHNIQUE_MAP = {
    'Chronoamperometry / Chronocoulometry': 'CA',
    'Chronoamperometry': 'CA',
    'Chronocoulometry': 'CC',
    'Chronopotentiometry': 'CP',
    'Cyclic Voltammetry': 'CV',
    'Linear Sweep Voltammetry': 'LSV',
    'Open Circuit Voltage': 'OCV',
    'Open Circuit Potential': 'OCP',
    'Potentio Electrochemical Impedance Spectroscopy': 'PEIS',
    'Galvano Electrochemical Impedance Spectroscopy': 'GEIS',
    'Impedance Spectroscopy': 'EIS',
    'Constant Current': 'CC',
    'Constant Voltage': 'CV',
    'IR compensation (PEIS)': 'ZIR',
}

# Default x/y column assignments per technique
# Note: ZIR excluded - single-row resistance measurement, handled in Processing section
TECHNIQUE_DEFAULTS = {
    'CV': {'x': 'Ewe/V', 'y': '<I>/mA'},
    'LSV': {'x': 'Ewe/V', 'y': '<I>/mA'},
    'CA': {'x': 'time/s', 'y': '<I>/mA'},
    'CP': {'x': 'time/s', 'y': 'Ewe/V'},
    'OCV': {'x': 'time/s', 'y': 'Ewe/V'},
    'OCP': {'x': 'time/s', 'y': 'Ewe/V'},
    'CC': {'x': 'time/s', 'y': 'Ewe/V'},
    'PEIS': {'x': 'Re(Z)/Ohm', 'y': '-Im(Z)/Ohm'},
    'GEIS': {'x': 'Re(Z)/Ohm', 'y': '-Im(Z)/Ohm'},
    'EIS': {'x': 'Re(Z)/Ohm', 'y': '-Im(Z)/Ohm'},
}


def extract_technique_from_filename(filename: str) -> str | None:
    """Extract technique abbreviation from .mpr filename."""
    base = filename.replace('.mpr', '')
    base = re.sub(r'_C\d+$', '', base)

    # Multi-scan pattern: _XX_TECHNIQUE at end
    match = re.search(r'_(\d{2})_([A-Z]+)$', base)
    if match:
        technique = match.group(2)
        if technique in TECHNIQUE_MAP.values():
            return technique

    # Single scan: technique at start or anywhere
    for abbrev in TECHNIQUE_MAP.values():
        if base.startswith(abbrev + '_') or base == abbrev:
            return abbrev

    parts = base.split('_')
    for part in parts:
        if part in TECHNIQUE_MAP.values():
            return part

    return None


def extract_label_from_filename(filename: str) -> str:
    """Extract a clean label from .mpr filename."""
    base = filename.replace('.mpr', '')
    label = re.sub(r'_C\d+$', '', base)
    label = re.sub(r'_\d{2}_[A-Z]+$', '', label)
    return label


def read_mpr_file(file_path: str) -> tuple[pl.DataFrame, dict]:
    """
    Read a BioLogic .mpr file.

    Parameters:
    -----------
    file_path : str
        Path to .mpr file

    Returns:
    --------
    tuple of (polars DataFrame, metadata dict)
    """
    mpr_data = BioLogic.MPRfile(file_path)
    data_dict = {col: mpr_data.data[col] for col in mpr_data.data.dtype.names}
    df = pl.DataFrame(data_dict)

    metadata = {}
    if hasattr(mpr_data, 'timestamp') and mpr_data.timestamp:
        metadata['timestamp'] = mpr_data.timestamp.isoformat()

    return df, metadata


def read_mpr_bytes(content: bytes, filename: str) -> tuple[pl.DataFrame, dict]:
    """
    Read a BioLogic .mpr file from bytes.

    Parameters:
    -----------
    content : bytes
        File contents
    filename : str
        Original filename (for temp file suffix)

    Returns:
    --------
    tuple of (polars DataFrame, metadata dict)
    """
    with tempfile.NamedTemporaryFile(suffix='.mpr', delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        df, metadata = read_mpr_file(tmp_path)
        return df, metadata
    finally:
        os.unlink(tmp_path)

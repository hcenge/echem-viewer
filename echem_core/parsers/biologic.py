"""BioLogic .mpr file parser."""

import os
import re
import tempfile
import polars as pl
from galvani import BioLogic

from ..types import EchemDataset, BIOLOGIC_COLUMN_MAP, convert_units

# Map full technique names from BioLogic to abbreviations
TECHNIQUE_MAP = {
    "Chronoamperometry / Chronocoulometry": "CA",
    "Chronoamperometry": "CA",
    "Chronocoulometry": "CC",
    "Chronopotentiometry": "CP",
    "Cyclic Voltammetry": "CV",
    "Linear Sweep Voltammetry": "LSV",
    "Open Circuit Voltage": "OCV",
    "Open Circuit Potential": "OCP",
    "Potentio Electrochemical Impedance Spectroscopy": "PEIS",
    "Galvano Electrochemical Impedance Spectroscopy": "GEIS",
    "Impedance Spectroscopy": "EIS",
    "Constant Current": "CC",
    "Constant Voltage": "CV",
    "IR compensation (PEIS)": "ZIR",
}


def extract_technique_from_filename(filename: str) -> str | None:
    """Extract technique abbreviation from .mpr filename."""
    base = filename.replace(".mpr", "")
    base = re.sub(r"_C\d+$", "", base)

    # Multi-scan pattern: _XX_TECHNIQUE at end
    match = re.search(r"_(\d{2})_([A-Z]+)$", base)
    if match:
        technique = match.group(2)
        if technique in TECHNIQUE_MAP.values():
            return technique

    # Single scan: technique at start or anywhere
    for abbrev in TECHNIQUE_MAP.values():
        if base.startswith(abbrev + "_") or base == abbrev:
            return abbrev

    parts = base.split("_")
    for part in parts:
        if part in TECHNIQUE_MAP.values():
            return part

    return None


def extract_label_from_filename(filename: str) -> str:
    """Extract a clean label from .mpr filename."""
    base = filename.replace(".mpr", "")
    label = re.sub(r"_C\d+$", "", base)
    label = re.sub(r"_\d{2}_[A-Z]+$", "", label)
    return label


def standardize_dataframe(df: pl.DataFrame) -> pl.DataFrame:
    """Convert BioLogic DataFrame to standard column names and SI units."""
    new_columns = []

    for col in df.columns:
        if col in BIOLOGIC_COLUMN_MAP:
            standard_name, source_unit, target_unit = BIOLOGIC_COLUMN_MAP[col]

            # Get conversion factor
            if source_unit and target_unit and source_unit != target_unit:
                factor = convert_units(1.0, source_unit, target_unit)
                new_columns.append((pl.col(col) * factor).alias(standard_name))
            else:
                new_columns.append(pl.col(col).alias(standard_name))
        else:
            # Keep unmapped columns as-is
            new_columns.append(pl.col(col))

    return df.select(new_columns)


def read_mpr_file(file_path: str, filename: str | None = None) -> EchemDataset:
    """Read a BioLogic .mpr file and return an EchemDataset.

    Args:
        file_path: Path to .mpr file
        filename: Original filename (defaults to basename of file_path)

    Returns:
        EchemDataset with standardized column names and SI units
    """
    if filename is None:
        filename = os.path.basename(file_path)

    mpr_data = BioLogic.MPRfile(file_path)
    data_dict = {col: mpr_data.data[col] for col in mpr_data.data.dtype.names}
    df = pl.DataFrame(data_dict)

    # Standardize columns and convert units
    df = standardize_dataframe(df)

    # Extract metadata
    timestamp = None
    if hasattr(mpr_data, "timestamp") and mpr_data.timestamp:
        timestamp = mpr_data.timestamp

    # Detect technique
    technique = extract_technique_from_filename(filename)

    # Detect cycles
    cycles = []
    if "cycle" in df.columns:
        cycles = sorted(df["cycle"].unique().to_list())

    return EchemDataset(
        filename=filename,
        df=df,
        columns=list(df.columns),
        technique=technique,
        label=extract_label_from_filename(filename),
        timestamp=timestamp,
        cycles=cycles,
        source_format="biologic",
        original_filename=filename,
    )


def read_mpr_bytes(content: bytes, filename: str) -> EchemDataset:
    """Read a BioLogic .mpr file from bytes.

    Args:
        content: File contents as bytes
        filename: Original filename

    Returns:
        EchemDataset with standardized column names and SI units
    """
    with tempfile.NamedTemporaryFile(suffix=".mpr", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        return read_mpr_file(tmp_path, filename)
    finally:
        os.unlink(tmp_path)

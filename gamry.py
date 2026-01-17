"""Gamry .DTA file support for echem-viewer."""

import re
import polars as pl
from typing import Optional

# Map Gamry column names to BioLogic equivalents
GAMRY_COLUMN_MAP = {
    # Potential columns
    'Vf': 'Ewe/V',
    'V': 'Ewe/V',
    'E': 'Ewe/V',
    # Current columns (Gamry uses Amps, convert to mA)
    'Im': '<I>/mA',
    'I': '<I>/mA',
    # Time
    'T': 'time/s',
    'Time': 'time/s',
    # Impedance
    'Zreal': 'Re(Z)/Ohm',
    'Zimag': 'Im(Z)/Ohm',
    'Zmod': '|Z|/Ohm',
    'Zphz': 'Phase(Z)/deg',
    # Frequency
    'Freq': 'freq/Hz',
    # Cycle
    'Cycle': 'cycle number',
}

# Columns that need unit conversion (Amps to mA)
CURRENT_COLUMNS = {'Im', 'I'}

# Technique detection from filename
GAMRY_TECHNIQUE_MAP = {
    'lsv': 'LSV',
    'cv': 'CV',
    'eis': 'PEIS',
    'ca': 'CA',
    'cp': 'CP',
    'ocv': 'OCV',
    'ocp': 'OCP',
}


def detect_technique_from_filename(filename: str) -> str | None:
    """Detect technique from Gamry filename."""
    lower = filename.lower()
    for pattern, technique in GAMRY_TECHNIQUE_MAP.items():
        if pattern in lower:
            return technique
    return None


def detect_technique_from_header(file_path: str) -> str | None:
    """Detect technique from Gamry file header TAG field."""
    with open(file_path, 'r', errors='ignore') as f:
        for line in f:
            if line.startswith('TAG'):
                parts = line.split('\t')
                if len(parts) >= 2:
                    tag = parts[1].strip().upper()
                    # Map common Gamry tags to technique abbreviations
                    tag_map = {
                        'CV': 'CV',
                        'LSV': 'LSV',
                        'CHRONOA': 'CA',
                        'CHRONOP': 'CP',
                        'CORPOT': 'OCP',
                        'EISPOT': 'PEIS',
                        'EISGALV': 'GEIS',
                    }
                    return tag_map.get(tag, tag)
            # Stop after header section
            if line.startswith('CURVE'):
                break
    return None


def read_gamry_file(file_path: str) -> tuple[pl.DataFrame, dict]:
    """
    Read a Gamry .DTA data file (all curves).

    Parameters:
    -----------
    file_path : str
        Path to Gamry data file

    Returns:
    --------
    tuple of (polars DataFrame with normalized columns, metadata dict)
    """
    metadata = {}

    with open(file_path, 'r', errors='ignore') as f:
        lines = f.readlines()

    # Extract metadata from header (before first CURVE)
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('CURVE') or re.match(r'Z?OCV?CURVE', stripped):
            break
        if '\t' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                key = parts[0].strip()
                value = parts[1].strip()
                if key and value and not key.startswith('#'):
                    metadata[key] = value

    # Find all CURVE markers with their line positions
    curve_lines = find_curve_lines(file_path)

    if not curve_lines:
        raise ValueError(f"No CURVE markers found in {file_path}")

    # Read all curves and concatenate
    all_dfs = []
    for i, (line_idx, curve_num) in enumerate(curve_lines):
        # Determine end line (start of next curve, or end of file)
        end_line = curve_lines[i + 1][0] if i + 1 < len(curve_lines) else None
        try:
            df = read_gamry_curve_at_line(file_path, line_idx, curve_num, end_line)
            all_dfs.append(df)
        except ValueError:
            continue

    if not all_dfs:
        raise ValueError(f"No data found in {file_path}")

    df_combined = pl.concat(all_dfs)
    return df_combined, metadata


def extract_label_from_filename(filename: str) -> str:
    """Extract a clean label from Gamry filename."""
    base = filename.replace('.DTA', '').replace('.dta', '')
    # Remove common prefixes/suffixes
    base = re.sub(r'^\d+_', '', base)  # Remove leading numbers
    return base


def find_curve_lines(file_path: str) -> list[tuple[int, int | None]]:
    """Find all CURVE markers and their optional numbers. Returns [(line_idx, curve_num), ...]"""
    curves = []
    with open(file_path, 'r', errors='ignore') as f:
        for i, line in enumerate(f):
            stripped = line.strip()
            # Match any CURVE marker with optional prefix and number
            if 'CURVE' in stripped and 'TABLE' in stripped:
                match = re.match(r'(\w*CURVE)(\d*)\s+TABLE', stripped)
                if match:
                    num = int(match.group(2)) if match.group(2) else None
                    curves.append((i, num))
    return curves


def read_gamry_curve_at_line(file_path: str, start_line: int, curve_num: int | None, end_line: int | None = None) -> pl.DataFrame:
    """Read curve data starting at a specific line."""
    with open(file_path, 'r', errors='ignore') as f:
        lines = f.readlines()

    header_line = start_line + 1
    data_start_line = start_line + 3  # After CURVE, headers, units

    if end_line is None:
        end_line = len(lines)

    # Get column names from header line
    column_names = [c.strip() for c in lines[header_line].strip().split('\t') if c.strip()]

    # Read data rows
    data_rows = []
    for line in lines[data_start_line:end_line]:
        stripped = line.strip()
        if not stripped:
            continue
        # Stop at next CURVE marker
        if re.match(r'(Z?OCV?CURVE)', stripped):
            break
        parts = stripped.split('\t')
        row = []
        for val in parts[:len(column_names)]:
            try:
                row.append(float(val.strip()))
            except ValueError:
                row.append(None)
        if len(row) == len(column_names):
            data_rows.append(row)

    if not data_rows:
        raise ValueError(f"No data rows found at line {start_line}")

    df = pl.DataFrame(data_rows, schema=column_names, orient='row')

    # Map columns to BioLogic equivalents (do this first to avoid duplicate 'cycle number')
    rename_map = {}
    for col in df.columns:
        if col in GAMRY_COLUMN_MAP:
            rename_map[col] = GAMRY_COLUMN_MAP[col]
    if rename_map:
        df = df.rename(rename_map)

    # Add cycle number column only if not already present (some files have Cycle column)
    if 'cycle number' not in df.columns:
        df = df.with_columns(pl.lit(curve_num if curve_num is not None else 0).alias('cycle number'))

    # Convert current from A to mA
    for orig_col in CURRENT_COLUMNS:
        mapped_col = GAMRY_COLUMN_MAP.get(orig_col)
        if mapped_col and mapped_col in df.columns:
            df = df.with_columns((pl.col(mapped_col) * 1000).alias(mapped_col))

    return df

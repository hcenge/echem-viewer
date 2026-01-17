"""Gamry .DTA file support for echem-viewer."""

import re
import polars as pl

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


def read_gamry_file(file_path: str) -> tuple[pl.DataFrame, dict]:
    """
    Read a Gamry .DTA data file.

    Parameters:
    -----------
    file_path : str
        Path to Gamry data file

    Returns:
    --------
    tuple of (polars DataFrame with normalized columns, metadata dict)
    """
    metadata = {}
    column_names = []
    data_start_line = None

    # Read all lines
    with open(file_path, 'r', errors='ignore') as f:
        lines = f.readlines()

    # Find CURVE marker and extract structure
    for i, line in enumerate(lines):
        stripped = line.strip()

        # Extract metadata from header (before CURVE)
        if '\t' in line and data_start_line is None:
            parts = line.split('\t')
            if len(parts) >= 2:
                key = parts[0].strip()
                value = parts[1].strip()
                if key and value and not key.startswith('#'):
                    metadata[key] = value

        # Find CURVE marker
        if stripped.startswith('CURVE'):
            # Column names are on the next line
            if i + 1 < len(lines):
                header_line = lines[i + 1].strip()
                column_names = header_line.split('\t')
                # Clean up column names
                column_names = [c.strip() for c in column_names if c.strip()]

            # Units are on line i+2, data starts on line i+3
            data_start_line = i + 3
            break

    if data_start_line is None or not column_names:
        raise ValueError(f"Could not find CURVE marker or column headers in {file_path}")

    # Parse data rows
    data_rows = []
    for line in lines[data_start_line:]:
        stripped = line.strip()
        if not stripped:
            continue

        parts = stripped.split('\t')
        if len(parts) >= len(column_names):
            row = []
            for j, val in enumerate(parts[:len(column_names)]):
                val = val.strip()
                try:
                    row.append(float(val))
                except ValueError:
                    row.append(None)  # Handle non-numeric values
            data_rows.append(row)

    if not data_rows:
        raise ValueError(f"No data rows found in {file_path}")

    # Create DataFrame with original column names
    df = pl.DataFrame(data_rows, schema=column_names, orient='row')

    # Map columns to BioLogic equivalents and convert units
    new_columns = {}
    for col in df.columns:
        if col in GAMRY_COLUMN_MAP:
            new_name = GAMRY_COLUMN_MAP[col]
            col_data = df[col]

            # Convert Amps to mA for current columns
            if col in CURRENT_COLUMNS:
                col_data = col_data * 1000

            new_columns[new_name] = col_data
        else:
            # Keep original column with original name
            new_columns[col] = df[col]

    df_normalized = pl.DataFrame(new_columns)

    return df_normalized, metadata


def extract_label_from_filename(filename: str) -> str:
    """Extract a clean label from Gamry filename."""
    base = filename.replace('.DTA', '').replace('.dta', '')
    # Remove common prefixes/suffixes
    base = re.sub(r'^\d+_', '', base)  # Remove leading numbers
    return base

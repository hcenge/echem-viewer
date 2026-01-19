"""Gamry .DTA file parser."""

import os
import re
import tempfile
import polars as pl

from ..types import EchemDataset, GAMRY_COLUMN_MAP, convert_units

# Technique detection from filename
TECHNIQUE_PATTERNS = {
    "lsv": "LSV",
    "cv": "CV",
    "eis": "PEIS",
    "ca": "CA",
    "cp": "CP",
    "ocv": "OCV",
    "ocp": "OCP",
}

# Technique detection from header TAG field
TAG_TO_TECHNIQUE = {
    "CV": "CV",
    "LSV": "LSV",
    "CHRONOA": "CA",
    "CHRONOP": "CP",
    "CORPOT": "OCP",
    "EISPOT": "PEIS",
    "EISGALV": "GEIS",
}


def detect_technique_from_filename(filename: str) -> str | None:
    """Detect technique from Gamry filename."""
    lower = filename.lower()
    for pattern, technique in TECHNIQUE_PATTERNS.items():
        if pattern in lower:
            return technique
    return None


def detect_technique_from_header(file_path: str) -> str | None:
    """Detect technique from Gamry file header TAG field."""
    with open(file_path, "r", errors="ignore") as f:
        for line in f:
            if line.startswith("TAG"):
                parts = line.split("\t")
                if len(parts) >= 2:
                    tag = parts[1].strip().upper()
                    return TAG_TO_TECHNIQUE.get(tag, tag)
            if line.startswith("CURVE"):
                break
    return None


def extract_label_from_filename(filename: str) -> str:
    """Extract a clean label from Gamry filename."""
    base = filename.replace(".DTA", "").replace(".dta", "")
    base = re.sub(r"^\d+_", "", base)
    return base


def find_curve_lines(file_path: str) -> list[tuple[int, int | None]]:
    """Find all CURVE markers and their optional numbers."""
    curves = []
    with open(file_path, "r", errors="ignore") as f:
        for i, line in enumerate(f):
            stripped = line.strip()
            if "CURVE" in stripped and "TABLE" in stripped:
                match = re.match(r"(\w*CURVE)(\d*)\s+TABLE", stripped)
                if match:
                    num = int(match.group(2)) if match.group(2) else None
                    curves.append((i, num))
    return curves


def standardize_dataframe(df: pl.DataFrame) -> pl.DataFrame:
    """Convert Gamry DataFrame to standard column names and SI units."""
    new_columns = []
    processed_standards = set()

    for col in df.columns:
        if col in GAMRY_COLUMN_MAP:
            standard_name, source_unit, target_unit = GAMRY_COLUMN_MAP[col]

            # Skip if we already have this standard column
            if standard_name in processed_standards:
                continue
            processed_standards.add(standard_name)

            # Get conversion factor
            if source_unit and target_unit and source_unit != target_unit:
                factor = convert_units(1.0, source_unit, target_unit)
                new_columns.append((pl.col(col) * factor).alias(standard_name))
            else:
                new_columns.append(pl.col(col).alias(standard_name))
        else:
            new_columns.append(pl.col(col))

    return df.select(new_columns)


def read_gamry_curve_at_line(
    lines: list[str], start_line: int, curve_num: int | None, end_line: int | None = None
) -> pl.DataFrame:
    """Read curve data starting at a specific line."""
    header_line = start_line + 1
    data_start_line = start_line + 3  # After CURVE, headers, units

    if end_line is None:
        end_line = len(lines)

    column_names = [c.strip() for c in lines[header_line].strip().split("\t") if c.strip()]

    data_rows = []
    for line in lines[data_start_line:end_line]:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"(Z?OCV?CURVE)", stripped):
            break
        parts = stripped.split("\t")
        row = []
        for val in parts[: len(column_names)]:
            try:
                row.append(float(val.strip()))
            except ValueError:
                row.append(None)
        if len(row) == len(column_names):
            data_rows.append(row)

    if not data_rows:
        raise ValueError(f"No data rows found at line {start_line}")

    df = pl.DataFrame(data_rows, schema=column_names, orient="row")

    # Add cycle column if not present
    if "Cycle" not in df.columns:
        df = df.with_columns(pl.lit(curve_num if curve_num is not None else 0).alias("Cycle"))

    return df


def read_gamry_file(file_path: str, filename: str | None = None) -> EchemDataset:
    """Read a Gamry .DTA file and return an EchemDataset.

    Args:
        file_path: Path to .dta file
        filename: Original filename (defaults to basename of file_path)

    Returns:
        EchemDataset with standardized column names and SI units
    """
    if filename is None:
        filename = os.path.basename(file_path)

    with open(file_path, "r", errors="ignore") as f:
        lines = f.readlines()

    # Extract metadata from header
    metadata = {}
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("CURVE") or re.match(r"Z?OCV?CURVE", stripped):
            break
        if "\t" in line:
            parts = line.split("\t")
            if len(parts) >= 2:
                key = parts[0].strip()
                value = parts[1].strip()
                if key and value and not key.startswith("#"):
                    metadata[key] = value

    # Find curve markers
    curve_lines = find_curve_lines(file_path)
    if not curve_lines:
        raise ValueError(f"No CURVE markers found in {file_path}")

    # Read all curves
    all_dfs = []
    for i, (line_idx, curve_num) in enumerate(curve_lines):
        end_line = curve_lines[i + 1][0] if i + 1 < len(curve_lines) else None
        try:
            df = read_gamry_curve_at_line(lines, line_idx, curve_num, end_line)
            all_dfs.append(df)
        except ValueError:
            continue

    if not all_dfs:
        raise ValueError(f"No data found in {file_path}")

    df = pl.concat(all_dfs)

    # Standardize columns and convert units
    df = standardize_dataframe(df)

    # Detect technique
    technique = detect_technique_from_header(file_path) or detect_technique_from_filename(filename)

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
        timestamp=None,
        cycles=cycles,
        source_format="gamry",
        original_filename=filename,
    )


def read_gamry_bytes(content: bytes, filename: str) -> EchemDataset:
    """Read a Gamry .DTA file from bytes.

    Args:
        content: File contents as bytes
        filename: Original filename

    Returns:
        EchemDataset with standardized column names and SI units
    """
    with tempfile.NamedTemporaryFile(suffix=".dta", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        return read_gamry_file(tmp_path, filename)
    finally:
        os.unlink(tmp_path)

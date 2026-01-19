"""Parsers for electrochemistry file formats."""

from ..types import EchemDataset
from .biologic import read_mpr_file, read_mpr_bytes
from .gamry import read_gamry_file, read_gamry_bytes


def load_file(file_path: str) -> EchemDataset:
    """Load an electrochemistry file, auto-detecting format by extension.

    Supported formats:
    - .mpr: BioLogic
    - .dta: Gamry

    Args:
        file_path: Path to the file

    Returns:
        EchemDataset with standardized column names and SI units

    Raises:
        ValueError: If file format is not supported
    """
    lower_path = file_path.lower()

    if lower_path.endswith(".mpr"):
        return read_mpr_file(file_path)
    elif lower_path.endswith(".dta"):
        return read_gamry_file(file_path)
    else:
        raise ValueError(f"Unsupported file format: {file_path}")


def load_file_bytes(content: bytes, filename: str) -> EchemDataset:
    """Load an electrochemistry file from bytes, auto-detecting format.

    Supported formats:
    - .mpr: BioLogic
    - .dta: Gamry

    Args:
        content: File contents as bytes
        filename: Original filename (used for format detection and metadata)

    Returns:
        EchemDataset with standardized column names and SI units

    Raises:
        ValueError: If file format is not supported
    """
    lower_name = filename.lower()

    if lower_name.endswith(".mpr"):
        return read_mpr_bytes(content, filename)
    elif lower_name.endswith(".dta"):
        return read_gamry_bytes(content, filename)
    else:
        raise ValueError(f"Unsupported file format: {filename}")


__all__ = [
    "load_file",
    "load_file_bytes",
    "read_mpr_file",
    "read_mpr_bytes",
    "read_gamry_file",
    "read_gamry_bytes",
]

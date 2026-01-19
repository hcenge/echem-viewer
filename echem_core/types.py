"""Data types for echem_core."""

from dataclasses import dataclass, field
from datetime import datetime
import polars as pl
import pint

# Initialize unit registry
ureg = pint.UnitRegistry()


@dataclass
class EchemDataset:
    """Represents a single electrochemistry measurement file.

    All data is stored in SI units with standardized column names:
    - time_s: seconds
    - potential_V: volts
    - current_A: amperes
    - z_real_Ohm, z_imag_Ohm, z_mag_Ohm: ohms
    - z_phase_deg: degrees
    - frequency_Hz: hertz
    - cycle: integer index
    """

    # Identity
    filename: str  # Original filename

    # Data (always SI units, encoded in column names)
    df: pl.DataFrame  # The measurement data
    columns: list[str]  # Column names (e.g., current_A, potential_V)

    # Metadata
    technique: str | None = None  # CA, CV, PEIS, etc.
    label: str | None = None  # User-editable label
    timestamp: datetime | None = None  # Measurement timestamp
    cycles: list[int] = field(default_factory=list)

    # Provenance
    source_format: str | None = None  # 'biologic' or 'gamry'
    original_filename: str | None = None  # Before any rename
    file_hash: str | None = None  # SHA256 of original file (future)

    # User-defined fields
    user_metadata: dict = field(default_factory=dict)


def convert_units(value: float, source_unit: str, target_unit: str) -> float:
    """Convert a value from source unit to target unit using pint.

    Args:
        value: The numeric value to convert
        source_unit: Unit string (e.g., "milliampere")
        target_unit: Target unit string (e.g., "ampere")

    Returns:
        Converted value
    """
    if not source_unit or not target_unit or source_unit == target_unit:
        return value
    return (value * ureg(source_unit)).to(target_unit).magnitude


# Standard column definitions with SI units
STANDARD_COLUMNS = {
    "time_s": {"unit": "second", "description": "Elapsed time"},
    "potential_V": {"unit": "volt", "description": "Working electrode potential"},
    "current_A": {"unit": "ampere", "description": "Current"},
    "z_real_Ohm": {"unit": "ohm", "description": "Real impedance"},
    "z_imag_Ohm": {"unit": "ohm", "description": "Imaginary impedance"},
    "z_mag_Ohm": {"unit": "ohm", "description": "Impedance magnitude"},
    "z_phase_deg": {"unit": "degree", "description": "Impedance phase"},
    "frequency_Hz": {"unit": "hertz", "description": "Frequency"},
    "cycle": {"unit": None, "description": "Cycle index (dimensionless)"},
}

# Column mappings: source_column -> (standard_name, source_unit, target_unit)
BIOLOGIC_COLUMN_MAP = {
    "time/s": ("time_s", "second", "second"),
    "Ewe/V": ("potential_V", "volt", "volt"),
    "<I>/mA": ("current_A", "milliampere", "ampere"),
    "Re(Z)/Ohm": ("z_real_Ohm", "ohm", "ohm"),
    "-Im(Z)/Ohm": ("z_imag_Ohm", "ohm", "ohm"),
    "|Z|/Ohm": ("z_mag_Ohm", "ohm", "ohm"),
    "Phase(Z)/deg": ("z_phase_deg", "degree", "degree"),
    "freq/Hz": ("frequency_Hz", "hertz", "hertz"),
    "cycle number": ("cycle", None, None),
}

GAMRY_COLUMN_MAP = {
    "T": ("time_s", "second", "second"),
    "Time": ("time_s", "second", "second"),
    "Vf": ("potential_V", "volt", "volt"),
    "V": ("potential_V", "volt", "volt"),
    "E": ("potential_V", "volt", "volt"),
    "Im": ("current_A", "ampere", "ampere"),
    "I": ("current_A", "ampere", "ampere"),
    "Zreal": ("z_real_Ohm", "ohm", "ohm"),
    "Zimag": ("z_imag_Ohm", "ohm", "ohm"),
    "Zmod": ("z_mag_Ohm", "ohm", "ohm"),
    "Zphz": ("z_phase_deg", "degree", "degree"),
    "Freq": ("frequency_Hz", "hertz", "hertz"),
    "Cycle": ("cycle", None, None),
}

# Map full technique names to standard abbreviations
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

# Default x/y columns for each technique (using standardized SI column names)
TECHNIQUE_DEFAULTS = {
    "CV": {"x": "potential_V", "y": "current_A"},
    "LSV": {"x": "potential_V", "y": "current_A"},
    "CA": {"x": "time_s", "y": "current_A"},
    "CP": {"x": "time_s", "y": "potential_V"},
    "OCV": {"x": "time_s", "y": "potential_V"},
    "OCP": {"x": "time_s", "y": "potential_V"},
    "CC": {"x": "time_s", "y": "potential_V"},
    "PEIS": {"x": "z_real_Ohm", "y": "z_imag_Ohm"},
    "GEIS": {"x": "z_real_Ohm", "y": "z_imag_Ohm"},
    "EIS": {"x": "z_real_Ohm", "y": "z_imag_Ohm"},
}

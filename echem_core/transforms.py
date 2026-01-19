"""Data transforms for electrochemistry data.

All transforms add new columns (non-destructive).
UI-only transforms (downsampling, unit display) stay in frontend.
"""

import polars as pl
from .types import EchemDataset


# --- Reference Electrode Potentials (vs SHE at 25°C) ---

REFERENCE_ELECTRODES = {
    "SHE": 0.0,
    "Ag/AgCl (sat. KCl)": 0.197,
    "Ag/AgCl (3M KCl)": 0.210,
    "Ag/AgCl (3M NaCl)": 0.209,
    "SCE": 0.244,
    "Hg/HgO (1M NaOH)": 0.140,
    "Hg/HgO (1M KOH)": 0.098,
    "Hg/Hg2SO4 (sat. K2SO4)": 0.654,
}


def convert_reference(
    dataset: EchemDataset,
    from_ref: str,
    to_ref: str,
    column: str = "potential_V",
) -> EchemDataset:
    """Convert potential to different reference electrode. Adds new column."""
    if from_ref not in REFERENCE_ELECTRODES:
        raise ValueError(f"Unknown reference: {from_ref}")
    if to_ref not in REFERENCE_ELECTRODES:
        raise ValueError(f"Unknown reference: {to_ref}")

    offset = REFERENCE_ELECTRODES[from_ref] - REFERENCE_ELECTRODES[to_ref]
    new_col = f"potential_vs_{to_ref.replace(' ', '_').replace('(', '').replace(')', '')}_V"

    new_df = dataset.df.with_columns((pl.col(column) + offset).alias(new_col))
    return _copy_dataset(dataset, new_df)


def ir_compensate(
    dataset: EchemDataset,
    resistance_ohm: float,
    v_col: str = "potential_V",
    i_col: str = "current_A",
) -> EchemDataset:
    """Correct potential for solution resistance. Adds potential_ir_corrected_V column."""
    new_col = "potential_ir_corrected_V"
    new_df = dataset.df.with_columns(
        (pl.col(v_col) - pl.col(i_col) * resistance_ohm).alias(new_col)
    )
    return _copy_dataset(dataset, new_df)


def normalize_by_area(
    dataset: EchemDataset,
    area_cm2: float,
    column: str = "current_A",
) -> EchemDataset:
    """Normalize current by electrode area. Adds current_density_A_cm2 column."""
    new_col = "current_density_A_cm2"
    new_df = dataset.df.with_columns((pl.col(column) / area_cm2).alias(new_col))
    return _copy_dataset(dataset, new_df)


def normalize_by_mass(
    dataset: EchemDataset,
    mass_g: float,
    column: str = "current_A",
) -> EchemDataset:
    """Normalize current by active material mass. Adds current_A_g column."""
    new_col = "current_A_g"
    new_df = dataset.df.with_columns((pl.col(column) / mass_g).alias(new_col))
    return _copy_dataset(dataset, new_df)


def _copy_dataset(dataset: EchemDataset, new_df: pl.DataFrame) -> EchemDataset:
    """Helper to create new dataset with updated df and columns."""
    return EchemDataset(
        filename=dataset.filename,
        df=new_df,
        columns=list(new_df.columns),
        technique=dataset.technique,
        label=dataset.label,
        timestamp=dataset.timestamp,
        cycles=dataset.cycles,
        source_format=dataset.source_format,
        original_filename=dataset.original_filename,
        file_hash=dataset.file_hash,
        user_metadata=dataset.user_metadata,
    )


# --- Filtering (returns new objects, original unchanged) ---

def filter_by_cycle(df: pl.DataFrame, cycle: int, cycle_col: str = "cycle") -> pl.DataFrame:
    """Filter DataFrame to a single cycle. Returns new DataFrame."""
    if cycle_col not in df.columns:
        return df
    return df.filter(pl.col(cycle_col) == cycle)


def filter_dataset_by_cycle(dataset: EchemDataset, cycle: int, cycle_col: str = "cycle") -> EchemDataset:
    """Filter dataset to single cycle. Returns new dataset, original unchanged."""
    filtered_df = filter_by_cycle(dataset.df, cycle, cycle_col)
    return _copy_dataset(dataset, filtered_df)


# --- Display performance ---

def downsample(df: pl.DataFrame, max_points: int = 50000) -> pl.DataFrame:
    """Reduce points for display (every Nth point). Returns new DataFrame."""
    if len(df) <= max_points:
        return df
    step = (len(df) + max_points - 1) // max_points
    return df.gather_every(step)

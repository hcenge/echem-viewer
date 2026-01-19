"""Export and import functions for electrochemistry sessions."""

import io
import json
import zipfile
from datetime import datetime

import polars as pl

from .types import EchemDataset


SCHEMA_VERSION = "1.0.0"
FORMAT_NAME = "echem-viewer-export"


def session_export(
    datasets: list[EchemDataset],
    plot_settings: dict | None = None,
    include_csv: bool = False,
) -> bytes:
    """Export datasets to zip file as bytes.

    Args:
        datasets: Datasets to export
        plot_settings: Optional plot configuration (for ui_state.json)
        include_csv: Also include CSV versions of data files

    Returns:
        Zip file contents as bytes
    """
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Build metadata
        metadata = {
            "schema_version": SCHEMA_VERSION,
            "format": FORMAT_NAME,
            "exported_at": datetime.now().isoformat(),
            "files": [],
        }

        # Export each dataset
        for ds in datasets:
            parquet_name = f"data/{ds.filename}.parquet"

            # Write parquet data
            parquet_buf = io.BytesIO()
            ds.df.write_parquet(parquet_buf)
            zf.writestr(parquet_name, parquet_buf.getvalue())

            # Optionally write CSV
            if include_csv:
                csv_name = f"data/{ds.filename}.csv"
                zf.writestr(csv_name, ds.df.write_csv())

            # Add file entry to metadata
            file_entry = {
                "filename": ds.filename,
                "parquet_path": parquet_name,
                "technique": ds.technique,
                "timestamp": ds.timestamp.isoformat() if ds.timestamp else None,
                "label": ds.label,
                "columns": ds.columns,
                "provenance": {
                    "original_filename": ds.original_filename,
                    "source_format": ds.source_format,
                    "file_hash": ds.file_hash,
                },
                "user_metadata": ds.user_metadata,
            }
            metadata["files"].append(file_entry)

        # Write metadata.json
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Write ui_state.json if plot settings provided
        if plot_settings:
            zf.writestr("ui_state.json", json.dumps(plot_settings, indent=2))

    return buffer.getvalue()


def session_import(content: bytes) -> tuple[list[EchemDataset], dict | None]:
    """Import session from zip file bytes.

    Args:
        content: Zip file contents as bytes

    Returns:
        Tuple of (datasets, ui_state or None)
    """
    from datetime import datetime as dt

    datasets = []
    ui_state = None

    with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
        # Read metadata
        metadata = json.loads(zf.read("metadata.json").decode("utf-8"))

        # Read ui_state if present
        if "ui_state.json" in zf.namelist():
            ui_state = json.loads(zf.read("ui_state.json").decode("utf-8"))

        # Load each dataset
        for file_info in metadata["files"]:
            parquet_path = file_info.get("parquet_path")

            # Handle old format (parquet_name instead of parquet_path)
            if not parquet_path:
                parquet_path = file_info.get("parquet_name")

            df = pl.read_parquet(io.BytesIO(zf.read(parquet_path)))

            # Parse timestamp
            timestamp = None
            if file_info.get("timestamp"):
                timestamp = dt.fromisoformat(file_info["timestamp"])

            # Get provenance info (may be nested or flat in old format)
            provenance = file_info.get("provenance", {})

            dataset = EchemDataset(
                filename=file_info["filename"],
                df=df,
                columns=file_info.get("columns", list(df.columns)),
                technique=file_info.get("technique"),
                label=file_info.get("label"),
                timestamp=timestamp,
                cycles=file_info.get("cycles", []),
                source_format=provenance.get("source_format") or file_info.get("source"),
                original_filename=provenance.get("original_filename"),
                file_hash=provenance.get("file_hash"),
                user_metadata=file_info.get("user_metadata", {}),
            )
            datasets.append(dataset)

    return datasets, ui_state

"""Export and import functions for electrochemistry sessions."""

import io
import json
import zipfile
from datetime import datetime

import polars as pl

from .types import EchemDataset


SCHEMA_VERSION = "2.0.0"
FORMAT_NAME = "echem-viewer-export"


def session_export(
    datasets: list[EchemDataset],
    plot_settings: dict | None = None,
    include_csv: bool = False,
    plot_code: str | None = None,
    plot_codes: dict[str, str] | None = None,
    plots_config: list[dict] | None = None,
    file_metadata: dict | None = None,
) -> bytes:
    """Export datasets to zip file as bytes.

    Args:
        datasets: Datasets to export
        plot_settings: Optional plot configuration (legacy, for ui_state.json)
        include_csv: Also include CSV versions of data files
        plot_code: Optional single Python plotting code (legacy)
        plot_codes: Dict of plot_name -> code for multi-plot export
        plots_config: List of plot configurations for multi-plot export
        file_metadata: Dict of filename -> custom column values

    Returns:
        Zip file contents as bytes
    """
    buffer = io.BytesIO()
    file_metadata = file_metadata or {}

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Build metadata (central file registry)
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

            # Get custom columns for this file
            custom = file_metadata.get(ds.filename, {})
            label = custom.pop("label", ds.label) if "label" in custom else ds.label

            # Add file entry to metadata
            file_entry = {
                "filename": ds.filename,
                "data_path": parquet_name,
                "technique": ds.technique,
                "timestamp": ds.timestamp.isoformat() if ds.timestamp else None,
                "source_format": ds.source_format,
                "columns": ds.columns,
                "cycles": ds.cycles,
                "label": label,
                "custom": custom,
                "provenance": {
                    "original_filename": ds.original_filename,
                    "file_hash": ds.file_hash,
                },
            }
            metadata["files"].append(file_entry)

        # Write metadata.json (central file registry)
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Write plots/plots.json if multi-plot config provided
        if plots_config:
            plots_data = {"plots": plots_config}
            zf.writestr("plots/plots.json", json.dumps(plots_data, indent=2))

        # Write plot code files
        if plot_codes:
            for name, code in plot_codes.items():
                # Sanitize filename
                safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
                zf.writestr(f"plots/{safe_name}.py", code)
        elif plot_code:
            # Legacy single plot code
            zf.writestr("plot.py", plot_code)

        # Write ui_state.json for legacy compatibility
        if plot_settings and not plots_config:
            zf.writestr("ui_state.json", json.dumps(plot_settings, indent=2))

        # Write file_table.csv for easy viewing in Excel
        if metadata["files"]:
            rows = []
            for f in metadata["files"]:
                row = {
                    "filename": f["filename"],
                    "label": f["label"] or "",
                    "technique": f["technique"] or "",
                    "timestamp": f["timestamp"] or "",
                }
                # Add custom columns
                for k, v in f.get("custom", {}).items():
                    row[k] = v if v is not None else ""
                rows.append(row)
            file_table_df = pl.DataFrame(rows)
            zf.writestr("file_table.csv", file_table_df.write_csv())

    return buffer.getvalue()


def csv_export(
    datasets: list[EchemDataset],
    plot_settings: dict | None = None,
    plot_code: str | None = None,
    plot_codes: dict[str, str] | None = None,
    plots_config: list[dict] | None = None,
    file_metadata: dict | None = None,
) -> bytes:
    """Export datasets to zip file with CSV format (for Excel/other software).

    Args:
        datasets: Datasets to export
        plot_settings: Optional plot configuration (legacy, for plot_settings.json)
        plot_code: Optional single Python plotting code (legacy)
        plot_codes: Dict of plot_name -> code for multi-plot export
        plots_config: List of plot configurations for multi-plot export
        file_metadata: Dict of filename -> custom column values

    Returns:
        Zip file contents as bytes
    """
    buffer = io.BytesIO()
    file_metadata = file_metadata or {}

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Build metadata
        metadata = {
            "schema_version": SCHEMA_VERSION,
            "format": FORMAT_NAME,
            "exported_at": datetime.now().isoformat(),
            "files": [],
        }

        # Export each dataset as CSV in data/ subfolder
        for ds in datasets:
            csv_name = f"data/{ds.filename}.csv"
            zf.writestr(csv_name, ds.df.write_csv())

            # Get custom columns for this file
            custom = file_metadata.get(ds.filename, {}).copy()
            label = custom.pop("label", ds.label) if "label" in custom else ds.label

            # Add file entry to metadata
            file_entry = {
                "filename": ds.filename,
                "data_path": csv_name,
                "technique": ds.technique,
                "timestamp": ds.timestamp.isoformat() if ds.timestamp else None,
                "source_format": ds.source_format,
                "columns": ds.columns,
                "cycles": ds.cycles,
                "label": label,
                "custom": custom,
            }
            metadata["files"].append(file_entry)

        # Write metadata.json
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Write plots/plots.json if multi-plot config provided
        if plots_config:
            plots_data = {"plots": plots_config}
            zf.writestr("plots/plots.json", json.dumps(plots_data, indent=2))

        # Write plot code files
        if plot_codes:
            for name, code in plot_codes.items():
                # Sanitize filename
                safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
                zf.writestr(f"plots/{safe_name}.py", code)
        elif plot_code:
            # Legacy single plot code
            zf.writestr("plot.py", plot_code)

        # Write plot_settings.json for legacy compatibility
        if plot_settings and not plots_config:
            zf.writestr("plot_settings.json", json.dumps(plot_settings, indent=2))

        # Write file_table.csv for easy viewing in Excel
        if metadata["files"]:
            rows = []
            for f in metadata["files"]:
                row = {
                    "filename": f["filename"],
                    "label": f["label"] or "",
                    "technique": f["technique"] or "",
                    "timestamp": f["timestamp"] or "",
                }
                # Add custom columns
                for k, v in f.get("custom", {}).items():
                    row[k] = v if v is not None else ""
                rows.append(row)
            file_table_df = pl.DataFrame(rows)
            zf.writestr("file_table.csv", file_table_df.write_csv())

    return buffer.getvalue()


def session_import(content: bytes) -> tuple[list[EchemDataset], dict | None, list[dict] | None, dict | None]:
    """Import session from zip file bytes.

    Handles both native format (metadata.json + parquet/csv) and legacy CSV export format.

    Args:
        content: Zip file contents as bytes

    Returns:
        Tuple of (datasets, ui_state, plots_config, file_metadata)
        - datasets: List of EchemDataset objects
        - ui_state: Legacy UI state dict or None
        - plots_config: List of plot configurations or None
        - file_metadata: Dict of filename -> custom columns or None
    """
    from datetime import datetime as dt

    datasets = []
    ui_state = None
    plots_config = None
    file_metadata = {}

    with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
        filelist = zf.namelist()

        # Detect format based on what files are present
        if "metadata.json" in filelist:
            # Native format: metadata.json + data files
            metadata = json.loads(zf.read("metadata.json").decode("utf-8"))

            # Read plots config if present (v2.0 format)
            if "plots/plots.json" in filelist:
                plots_data = json.loads(zf.read("plots/plots.json").decode("utf-8"))
                plots_config = plots_data.get("plots", [])

            # Read ui_state for legacy compatibility
            if "ui_state.json" in filelist:
                ui_state = json.loads(zf.read("ui_state.json").decode("utf-8"))
            elif "ui_state" in metadata:
                ui_state = metadata["ui_state"]

            # Load each dataset
            for file_info in metadata["files"]:
                # Support both v1 and v2 path field names
                data_path = file_info.get("data_path") or file_info.get("parquet_path") or file_info.get("parquet_name")

                if data_path not in filelist:
                    # Try to find the file
                    if f"data/{file_info['filename']}.parquet" in filelist:
                        data_path = f"data/{file_info['filename']}.parquet"
                    elif f"data/{file_info['filename']}.csv" in filelist:
                        data_path = f"data/{file_info['filename']}.csv"
                    else:
                        continue

                # Read data based on extension
                if data_path.endswith(".parquet"):
                    df = pl.read_parquet(io.BytesIO(zf.read(data_path)))
                else:
                    df = pl.read_csv(io.BytesIO(zf.read(data_path)))

                timestamp = None
                if file_info.get("timestamp"):
                    try:
                        timestamp = dt.fromisoformat(file_info["timestamp"])
                    except (ValueError, TypeError):
                        pass

                provenance = file_info.get("provenance", {})

                dataset = EchemDataset(
                    filename=file_info["filename"],
                    df=df,
                    columns=file_info.get("columns", list(df.columns)),
                    technique=file_info.get("technique"),
                    label=file_info.get("label"),
                    timestamp=timestamp,
                    cycles=file_info.get("cycles", []),
                    source_format=provenance.get("source_format") or file_info.get("source_format"),
                    original_filename=provenance.get("original_filename"),
                    file_hash=provenance.get("file_hash"),
                    user_metadata=file_info.get("user_metadata", {}),
                )
                datasets.append(dataset)

                # Build file_metadata from custom columns
                custom = file_info.get("custom", {})
                if file_info.get("label"):
                    custom["label"] = file_info["label"]
                if custom:
                    file_metadata[file_info["filename"]] = custom

        elif "metadata.csv" in filelist:
            # Legacy CSV export format: metadata.csv + csv files in data/
            meta_df = pl.read_csv(io.BytesIO(zf.read("metadata.csv")))

            # Read plot settings if present
            if "plot_settings.json" in filelist:
                ui_state = json.loads(zf.read("plot_settings.json").decode("utf-8"))

            # Load each dataset from CSV
            for row in meta_df.iter_rows(named=True):
                filename = row["filename"]
                csv_path = f"data/{filename}.csv"

                if csv_path not in filelist:
                    continue

                df = pl.read_csv(io.BytesIO(zf.read(csv_path)))

                timestamp = None
                if row.get("timestamp"):
                    try:
                        timestamp = dt.fromisoformat(row["timestamp"])
                    except (ValueError, TypeError):
                        pass

                dataset = EchemDataset(
                    filename=filename,
                    df=df,
                    columns=list(df.columns),
                    technique=row.get("technique"),
                    label=row.get("label"),
                    timestamp=timestamp,
                    cycles=[],
                    source_format=None,
                    original_filename=None,
                    file_hash=None,
                    user_metadata={},
                )
                datasets.append(dataset)

                # Build file_metadata
                file_metadata[filename] = {"label": row.get("label", filename)}

        else:
            raise ValueError("Invalid export format: missing metadata.json or metadata.csv")

    return datasets, ui_state, plots_config, file_metadata

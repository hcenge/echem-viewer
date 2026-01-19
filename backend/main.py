"""FastAPI backend for echem-viewer."""

import sys
from pathlib import Path

# Add parent directory to path for echem_core import
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from echem_core import (
    load_file_bytes,
    session_import,
    session_export,
    csv_export,
    generate_plot_code,
    generate_matplotlib_code,
    EchemDataset,
    TECHNIQUE_DEFAULTS,
)
from state import state, MAX_FILES, MAX_FILE_SIZE_MB


app = FastAPI(title="Echem Viewer API")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Pydantic Models ==============

class FileInfo(BaseModel):
    """File information returned to client."""
    filename: str
    label: str
    technique: str | None
    timestamp: str | None
    source: str | None
    cycles: list[int]
    columns: list[str]
    custom: dict = {}  # Custom column values for this file


class MetadataUpdate(BaseModel):
    """Metadata fields that can be updated."""
    label: str | None = None
    # Custom columns can be any key-value pairs
    custom: dict | None = None


class DataRequest(BaseModel):
    """Request for chart data."""
    x_col: str
    y_col: str
    cycles: list[int] | None = None
    max_points: int | None = 5000  # Downsample if more points than this


class DataResponse(BaseModel):
    """Chart-ready data for a single file."""
    x: list[float]
    y: list[float]


class UploadResponse(BaseModel):
    """Response from file upload."""
    files: list[FileInfo]
    plots: list[dict] | None = None  # Restored plots from session import


class PlotConfigExport(BaseModel):
    """Plot configuration for export."""
    id: str
    name: str
    selected_files: list[str]
    selected_cycles: dict = {}
    settings: dict = {}


class ExportRequest(BaseModel):
    """Export configuration."""
    files: list[str]  # All files to include (for backwards compat)
    format: str = "parquet"  # "parquet" or "csv"
    code_style: str = "plotly"  # "plotly" or "matplotlib"
    plot_settings: dict | None = None  # Legacy single plot settings
    plots: list[PlotConfigExport] | None = None  # Multi-plot configs
    file_metadata: dict | None = None  # Custom columns from file table


# ============== Endpoints ==============

@app.get("/")
def root():
    """Health check."""
    return {"status": "ok", "files_loaded": len(state.datasets)}


@app.get("/stats")
def get_stats():
    """Get session statistics for monitoring."""
    return {
        "file_count": state.file_count,
        "max_files": MAX_FILES,
        "files_remaining": state.files_remaining(),
        "memory_mb": round(state.get_memory_estimate_mb(), 2),
        "max_file_size_mb": MAX_FILE_SIZE_MB,
    }


@app.post("/upload")
async def upload_files(files: list[UploadFile]) -> UploadResponse:
    """Upload .mpr, .dta, or .zip files."""
    added = []
    restored_plots = None

    # Check file count limit
    remaining = state.files_remaining()
    if remaining == 0:
        raise HTTPException(
            status_code=400,
            detail=f"File limit reached ({MAX_FILES} files). Delete some files to upload more."
        )

    for file in files:
        # Check if we've hit the limit during this upload batch
        if not state.can_add_files:
            break

        content = await file.read()
        filename = file.filename or "unknown"

        # Check file size
        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(
                status_code=400,
                detail=f"File {filename} is too large ({file_size_mb:.1f}MB). Max size is {MAX_FILE_SIZE_MB}MB."
            )

        # Validate extension
        ext = Path(filename).suffix.lower()
        if ext not in (".mpr", ".dta", ".zip"):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type: {ext}. Accepted: .mpr, .dta, .zip"
            )

        try:
            if ext == ".zip":
                # Session import (returns datasets, ui_state, plots_config, file_metadata)
                datasets, ui_state, plots_config, imported_metadata = session_import(content)
                for ds in datasets:
                    if not state.can_add_files:
                        break
                    state.add_dataset(ds)
                    added.append(_dataset_to_file_info(ds))
                    # Restore file metadata (custom columns, labels)
                    if imported_metadata and ds.filename in imported_metadata:
                        state.update_metadata(ds.filename, imported_metadata[ds.filename])
                # Return plots config for frontend to restore
                if plots_config:
                    restored_plots = plots_config
            else:
                # Parse raw data file
                ds = load_file_bytes(content, filename)
                state.add_dataset(ds)
                added.append(_dataset_to_file_info(ds))
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse {filename}: {str(e)}"
            )

    return UploadResponse(files=added, plots=restored_plots)


@app.get("/files")
def list_files() -> list[FileInfo]:
    """List all loaded files with metadata."""
    result = []
    for filename, ds in state.datasets.items():
        info = _dataset_to_file_info(ds)
        # Merge user-edited metadata
        if filename in state.file_metadata:
            meta = state.file_metadata[filename]
            info.label = meta.get("label", info.label)
            # Extract custom columns (everything except 'label')
            info.custom = {k: v for k, v in meta.items() if k != "label"}
        result.append(info)
    return result


@app.delete("/files/{filename}")
def delete_file(filename: str):
    """Remove a file from the session."""
    if filename not in state.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    state.remove_dataset(filename)
    return {"status": "deleted", "filename": filename}


@app.patch("/files/{filename}/metadata")
def update_file_metadata(filename: str, updates: MetadataUpdate):
    """Update editable metadata for a file."""
    if filename not in state.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    update_dict = {}
    if updates.label is not None:
        update_dict["label"] = updates.label
    if updates.custom is not None:
        update_dict.update(updates.custom)

    state.update_metadata(filename, update_dict)
    return {"status": "updated", "filename": filename}


@app.post("/data/{filename}")
def get_file_data(filename: str, request: DataRequest) -> DataResponse:
    """Get display-ready x/y data for a file."""
    if filename not in state.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    ds = state.datasets[filename]
    df = ds.df

    # Filter by cycles if specified
    if request.cycles and "cycle" in df.columns:
        import polars as pl
        df = df.filter(pl.col("cycle").is_in(request.cycles))

    # Validate columns exist
    if request.x_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column not found: {request.x_col}")
    if request.y_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column not found: {request.y_col}")

    x_data = df[request.x_col].to_list()
    y_data = df[request.y_col].to_list()

    # Downsample if too many points (for chart performance)
    if request.max_points and len(x_data) > request.max_points:
        step = len(x_data) // request.max_points
        x_data = x_data[::step]
        y_data = y_data[::step]

    return DataResponse(
        x=x_data,
        y=y_data,
    )


@app.get("/techniques")
def get_techniques() -> dict:
    """Get techniques present in loaded data and their defaults."""
    techniques = set()
    for ds in state.datasets.values():
        if ds.technique:
            techniques.add(ds.technique)

    return {
        "techniques": sorted(techniques),
        "defaults": TECHNIQUE_DEFAULTS,
    }


@app.post("/export")
def export_session(request: ExportRequest):
    """Export selected files as zip."""
    # Get selected datasets
    datasets = []
    for filename in request.files:
        if filename not in state.datasets:
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        datasets.append(state.datasets[filename])

    if not datasets:
        raise HTTPException(status_code=400, detail="No files selected for export")

    # Build file metadata with custom columns
    file_metadata = request.file_metadata or {}
    for fname in request.files:
        if fname not in file_metadata:
            file_metadata[fname] = state.file_metadata.get(fname, {})

    # Generate plot codes (one per plot if multi-plot, or single code for legacy)
    plot_codes = {}
    data_ext = ".parquet" if request.format == "parquet" else ".csv"

    if request.plots:
        # Multi-plot export: generate code for each plot
        for plot in request.plots:
            files_for_code = [
                {
                    "path": f"data/{fname}{data_ext}",
                    "label": file_metadata.get(fname, {}).get("label", fname)
                }
                for fname in plot.selected_files
            ]
            if request.code_style == "matplotlib":
                plot_codes[plot.name] = generate_matplotlib_code(plot.settings, files_for_code)
            else:
                plot_codes[plot.name] = generate_plot_code(plot.settings, files_for_code)
    elif request.plot_settings:
        # Legacy single plot export
        files_for_code = [
            {
                "path": f"data/{fname}{data_ext}",
                "label": file_metadata.get(fname, {}).get("label", fname)
            }
            for fname in request.files
        ]
        if request.code_style == "matplotlib":
            plot_codes["plot"] = generate_matplotlib_code(request.plot_settings, files_for_code)
        else:
            plot_codes["plot"] = generate_plot_code(request.plot_settings, files_for_code)

    # Build plots config for ui_state
    plots_config = None
    if request.plots:
        plots_config = [
            {
                "id": p.id,
                "name": p.name,
                "selected_files": p.selected_files,
                "selected_cycles": p.selected_cycles,
                "settings": p.settings,
            }
            for p in request.plots
        ]

    # Create export
    if request.format == "csv":
        content = csv_export(
            datasets,
            plot_settings=request.plot_settings,
            plot_codes=plot_codes,
            plots_config=plots_config,
            file_metadata=file_metadata,
        )
        media_type = "application/zip"
        filename = "echem_export_csv.zip"
    else:
        content = session_export(
            datasets,
            plot_settings=request.plot_settings,
            plot_codes=plot_codes,
            plots_config=plots_config,
            file_metadata=file_metadata,
        )
        media_type = "application/zip"
        filename = "echem_export.zip"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============== Helpers ==============

def _dataset_to_file_info(ds: EchemDataset) -> FileInfo:
    """Convert EchemDataset to FileInfo response model."""
    return FileInfo(
        filename=ds.filename,
        label=ds.label or ds.filename,
        technique=ds.technique,
        timestamp=ds.timestamp.isoformat() if ds.timestamp else None,
        source=ds.source_format,
        cycles=ds.cycles,
        columns=ds.columns,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

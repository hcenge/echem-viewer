"""FastAPI backend for echem-viewer with multi-user session support."""

import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Add parent directory to path for echem_core import
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, UploadFile, HTTPException, Cookie, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
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
    # Analysis functions
    find_hf_intercept,
    calculate_time_average,
    calculate_charge,
    overpotential_at_current,
    onset_potential,
    limiting_current,
    current_at_potential,
    steady_state_potential,
)
from state import (
    session_manager,
    SessionState,
    MAX_FILES,
    MAX_FILE_SIZE_MB,
    MAX_MEMORY_PER_SESSION_MB,
    SESSION_TTL_HOURS,
)

# Cookie settings
SESSION_COOKIE_NAME = "echem_session_id"
SESSION_COOKIE_MAX_AGE = SESSION_TTL_HOURS * 60 * 60  # Convert to seconds


# ============== Lifespan (startup/shutdown) ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan - start/stop background cleanup task."""
    # Startup: start the cleanup background task
    await session_manager.start_cleanup_task()
    print(f"[Startup] Session cleanup task started (interval: 30 min, TTL: {SESSION_TTL_HOURS}h)")
    yield
    # Shutdown: stop the cleanup task
    await session_manager.stop_cleanup_task()
    print("[Shutdown] Session cleanup task stopped")


app = FastAPI(title="Echem Viewer API", lifespan=lifespan)

# CORS for local development and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://echem.helenengelhardt.ca",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Session Dependency ==============

def get_session(
    request: Request,
    response: Response,
    echem_session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> SessionState:
    """Get or create session from cookie. Sets cookie if new session created."""
    session_id, session = session_manager.get_or_create_session(echem_session_id)

    # Set/refresh the session cookie if it's new or needs refreshing
    if session_id != echem_session_id:
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_id,
            max_age=SESSION_COOKIE_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=False,  # Set to True in production with HTTPS
        )

    return session


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
    analysis: dict = {}  # Pre-computed analysis results (e.g., EIS intercepts)


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
    ir_resistance: float | None = None  # For iR correction: V_corrected = V - I * R


class DataResponse(BaseModel):
    """Chart-ready data for a single file."""
    x: list[float]
    y: list[float]


class UploadResponse(BaseModel):
    """Response from file upload."""
    files: list[FileInfo]
    plots: list[dict] | None = None  # Restored plots from session import
    errors: list[str] = []  # Files that failed to upload with error messages


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


class AnalysisRequest(BaseModel):
    """Analysis request for a specific technique."""
    files: list[str]  # Files to analyze
    # Optional parameters for different analysis types
    t_start: float | None = None  # For CA/CP time average
    t_end: float | None = None
    target_current: float | None = None  # For CP overpotential
    target_potential: float | None = None  # For LSV current_at_potential
    threshold_current: float | None = None  # For LSV onset potential


class CorrelationsImportResponse(BaseModel):
    """Response from correlations import."""
    applied: int
    skipped: int
    errors: list[str]


# ============== Endpoints ==============

@app.get("/api/health")
def health():
    """Health check."""
    stats = session_manager.get_stats()
    return {"status": "ok", **stats}


@app.get("/stats")
def get_stats(session: SessionState = Depends(get_session)):
    """Get session statistics for monitoring."""
    return {
        "file_count": session.file_count,
        "max_files": MAX_FILES,
        "files_remaining": session.files_remaining(),
        "memory_mb": round(session.get_memory_estimate_mb(), 2),
        "max_memory_mb": MAX_MEMORY_PER_SESSION_MB,
        "max_file_size_mb": MAX_FILE_SIZE_MB,
        "session_id": session.session_id[:8],  # Show partial ID for debugging
    }


@app.post("/upload")
async def upload_files(
    files: list[UploadFile],
    session: SessionState = Depends(get_session),
) -> UploadResponse:
    """Upload .mpr, .dta, or .zip files. Continues on individual file failures."""
    added = []
    errors = []
    restored_plots = None

    # Check file count limit
    remaining = session.files_remaining()
    if remaining == 0:
        raise HTTPException(
            status_code=400,
            detail=f"File limit reached ({MAX_FILES} files). Delete some files to upload more."
        )

    for file in files:
        # Check if we've hit the limit during this upload batch
        if not session.can_add_files:
            errors.append(f"{file.filename}: File limit reached")
            continue

        content = await file.read()
        filename = file.filename or "unknown"

        # Check file size
        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > MAX_FILE_SIZE_MB:
            errors.append(f"{filename}: Too large ({file_size_mb:.1f}MB, max {MAX_FILE_SIZE_MB}MB)")
            continue

        # Validate extension
        ext = Path(filename).suffix.lower()
        if ext not in (".mpr", ".dta", ".zip"):
            errors.append(f"{filename}: Invalid file type {ext}")
            continue

        try:
            if ext == ".zip":
                # Session import (returns datasets, ui_state, plots_config, file_metadata)
                datasets, ui_state, plots_config, imported_metadata = session_import(content)

                # Check memory limit for all datasets
                total_new_memory = sum(
                    ds.df.estimated_size() / (1024 * 1024)
                    for ds in datasets if ds.df is not None
                )
                if not session.can_add_memory(total_new_memory):
                    errors.append(
                        f"{filename}: Would exceed memory limit "
                        f"(need {total_new_memory:.1f}MB, have {MAX_MEMORY_PER_SESSION_MB - session.get_memory_estimate_mb():.1f}MB free)"
                    )
                    continue

                for ds in datasets:
                    if not session.can_add_files:
                        break
                    session.add_dataset(ds)
                    added.append(_dataset_to_file_info(ds))
                    # Restore file metadata (custom columns, labels)
                    if imported_metadata and ds.filename in imported_metadata:
                        session.update_metadata(ds.filename, imported_metadata[ds.filename])
                # Return plots config for frontend to restore
                if plots_config:
                    restored_plots = plots_config
            else:
                # Parse raw data file
                ds = load_file_bytes(content, filename)

                # Check memory limit
                new_memory = ds.df.estimated_size() / (1024 * 1024) if ds.df is not None else 0
                if not session.can_add_memory(new_memory):
                    errors.append(
                        f"{filename}: Would exceed memory limit "
                        f"(need {new_memory:.1f}MB, have {MAX_MEMORY_PER_SESSION_MB - session.get_memory_estimate_mb():.1f}MB free)"
                    )
                    continue

                session.add_dataset(ds)
                added.append(_dataset_to_file_info(ds))
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
            continue

    return UploadResponse(files=added, plots=restored_plots, errors=errors)


@app.get("/files")
def list_files(session: SessionState = Depends(get_session)) -> list[FileInfo]:
    """List all loaded files with metadata."""
    result = []
    for filename, ds in session.datasets.items():
        info = _dataset_to_file_info(ds)
        # Merge user-edited metadata
        if filename in session.file_metadata:
            meta = session.file_metadata[filename]
            info.label = meta.get("label", info.label)
            # Extract custom columns (everything except 'label')
            info.custom = {k: v for k, v in meta.items() if k != "label"}
        result.append(info)
    return result


@app.delete("/files/{filename}")
def delete_file(filename: str, session: SessionState = Depends(get_session)):
    """Remove a file from the session."""
    if filename not in session.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    session.remove_dataset(filename)
    return {"status": "deleted", "filename": filename}


@app.patch("/files/{filename}/metadata")
def update_file_metadata(
    filename: str,
    updates: MetadataUpdate,
    session: SessionState = Depends(get_session),
):
    """Update editable metadata for a file."""
    if filename not in session.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    update_dict = {}
    if updates.label is not None:
        update_dict["label"] = updates.label
    if updates.custom is not None:
        update_dict.update(updates.custom)

    session.update_metadata(filename, update_dict)
    return {"status": "updated", "filename": filename}


@app.post("/data/{filename}")
def get_file_data(
    filename: str,
    request: DataRequest,
    session: SessionState = Depends(get_session),
) -> DataResponse:
    """Get display-ready x/y data for a file."""
    import polars as pl

    if filename not in session.datasets:
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    ds = session.datasets[filename]
    df = ds.df

    # Filter by cycles if specified
    if request.cycles and "cycle" in df.columns:
        df = df.filter(pl.col("cycle").is_in(request.cycles))

    # Apply iR correction if requested
    # Creates potential_ir_corrected_V = potential_V - current_A * ir_resistance
    if request.ir_resistance is not None:
        if "potential_V" in df.columns and "current_A" in df.columns:
            df = df.with_columns(
                (pl.col("potential_V") - pl.col("current_A") * request.ir_resistance)
                .alias("potential_ir_corrected_V")
            )

    # Validate columns exist (after potential iR correction column creation)
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
def get_techniques(session: SessionState = Depends(get_session)) -> dict:
    """Get techniques present in loaded data and their defaults."""
    techniques = set()
    for ds in session.datasets.values():
        if ds.technique:
            techniques.add(ds.technique)

    return {
        "techniques": sorted(techniques),
        "defaults": TECHNIQUE_DEFAULTS,
    }


@app.post("/correlations/import")
async def import_correlations(
    file: UploadFile,
    session: SessionState = Depends(get_session),
) -> CorrelationsImportResponse:
    """Import a CSV lookup table mapping echem files to PEIS files for iR correction.

    CSV format (minimum required columns):
    echem_ca_file,echem_peis_file
    0pt5V_02_CA_C01.mpr,0pt5V_01_PEIS_C01.mpr
    """
    import csv

    content = await file.read()

    try:
        # Decode and parse CSV
        text = content.decode('utf-8')
        reader = csv.DictReader(text.strip().splitlines())

        # Validate required columns
        fieldnames = reader.fieldnames or []
        if 'echem_ca_file' not in fieldnames or 'echem_peis_file' not in fieldnames:
            raise HTTPException(
                status_code=400,
                detail="CSV must have 'echem_ca_file' and 'echem_peis_file' columns"
            )

        applied = 0
        skipped = 0
        errors = []

        for row in reader:
            ca_file = row.get('echem_ca_file', '').strip()
            peis_file = row.get('echem_peis_file', '').strip()

            if not ca_file or not peis_file:
                skipped += 1
                continue

            # Check if both files exist in session
            if ca_file not in session.datasets:
                errors.append(f"{ca_file}: File not found in session")
                skipped += 1
                continue

            if peis_file not in session.datasets:
                errors.append(f"{peis_file}: PEIS file not found in session")
                skipped += 1
                continue

            # Update the CA file's metadata with linked PEIS file
            session.update_metadata(ca_file, {'linked_peis_file': peis_file})
            applied += 1

        return CorrelationsImportResponse(
            applied=applied,
            skipped=skipped,
            errors=errors
        )

    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid file encoding. Please use UTF-8.")
    except csv.Error as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {str(e)}")


@app.post("/analysis/{technique}")
def run_analysis(
    technique: str,
    request: AnalysisRequest,
    session: SessionState = Depends(get_session),
) -> dict:
    """Run technique-specific analysis on selected files.

    Returns a dict mapping filename -> analysis results.
    """
    results = {}

    for filename in request.files:
        if filename not in session.datasets:
            continue

        ds = session.datasets[filename]
        df = ds.df
        file_results = {}

        if technique in ("PEIS", "GEIS", "EIS"):
            # EIS analysis: HF intercept (R_s) for iR correction
            hf = find_hf_intercept(df)
            if hf is not None:
                file_results["hf_intercept_ohm"] = round(hf, 4)

        elif technique == "CA":
            # Chronoamperometry: time average and charge
            if request.t_start is not None and request.t_end is not None:
                avg_current = calculate_time_average(
                    df, "current_A", request.t_start, request.t_end
                )
                if avg_current is not None:
                    file_results["avg_current_A"] = avg_current
                    # Also provide in mA for convenience
                    file_results["avg_current_mA"] = avg_current * 1000

            charge = calculate_charge(df)
            if charge is not None:
                file_results["charge_C"] = charge
                file_results["charge_mC"] = charge * 1000

        elif technique == "CP":
            # Chronopotentiometry: time average of potential
            if request.t_start is not None and request.t_end is not None:
                avg_potential = calculate_time_average(
                    df, "potential_V", request.t_start, request.t_end
                )
                if avg_potential is not None:
                    file_results["avg_potential_V"] = avg_potential

            # Overpotential at target current
            if request.target_current is not None:
                overpot = overpotential_at_current(df, request.target_current)
                if overpot is not None:
                    file_results["overpotential_V"] = overpot

        elif technique == "LSV":
            # Linear sweep voltammetry
            # Onset potential
            if request.threshold_current is not None:
                onset = onset_potential(df, request.threshold_current)
                if onset is not None:
                    file_results["onset_potential_V"] = onset

            # Limiting current
            lim_current = limiting_current(df)
            if lim_current is not None:
                file_results["limiting_current_A"] = lim_current
                file_results["limiting_current_mA"] = lim_current * 1000

            # Current at specific potential
            if request.target_potential is not None:
                current = current_at_potential(df, request.target_potential)
                if current is not None:
                    file_results["current_at_potential_A"] = current
                    file_results["current_at_potential_mA"] = current * 1000

        elif technique == "OCV":
            # Open circuit voltage: steady state
            ss_potential = steady_state_potential(df)
            if ss_potential is not None:
                file_results["steady_state_V"] = ss_potential

        elif technique == "CV":
            # Cyclic voltammetry: charge per cycle
            charge = calculate_charge(df)
            if charge is not None:
                file_results["charge_C"] = charge
                file_results["charge_mC"] = charge * 1000

        if file_results:
            results[filename] = file_results

    return {"technique": technique, "results": results}


@app.post("/export")
def export_session(
    request: ExportRequest,
    session: SessionState = Depends(get_session),
):
    """Export selected files as zip."""
    # Get selected datasets
    datasets = []
    for filename in request.files:
        if filename not in session.datasets:
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        datasets.append(session.datasets[filename])

    if not datasets:
        raise HTTPException(status_code=400, detail="No files selected for export")

    # Build file metadata with custom columns
    file_metadata = request.file_metadata or {}
    for fname in request.files:
        if fname not in file_metadata:
            file_metadata[fname] = session.file_metadata.get(fname, {})

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
        analysis={},  # Analysis is done on-demand via /analysis endpoint
    )


# ============== Static File Serving (Production) ==============

# Path to built frontend
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"

# Mount static assets if frontend is built
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes (SPA catch-all)."""
        # Try to serve the requested file
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Fall back to index.html for SPA routing
        return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)

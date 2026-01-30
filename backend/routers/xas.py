"""
XAS API router for operando workbench functionality.

Provides endpoints for:
- Project management (open/close project folders)
- Sample/dataset/scan navigation
- XAS normalization
- Reference management
- Peak fitting
- Data export with provenance
"""

from pathlib import Path
from typing import Optional
from datetime import datetime
import io
import zipfile
import json

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from tinydb import TinyDB, Query
import numpy as np

from echem_core.xas import (
    normalize_single_scan,
    average_scans_for_dataset,
    calculate_derivative,
    fit_peaks,
    estimate_initial_guesses,
    scan_h5_for_datasets,
    find_valid_scans,
    BEAMLINE_CONFIGS,
)
from echem_core.xas.codegen import generate_xas_code

router = APIRouter()


# =============================================================================
# Global State (single-user, local deployment)
# =============================================================================

class XASProjectState:
    """Holds current XAS project state."""

    def __init__(self):
        self.project_path: Optional[Path] = None
        self.db_path: Optional[Path] = None
        self.db: Optional[TinyDB] = None
        self.h5_paths: dict = {}
        self.parent_path: str = "instrument"

    def open(self, path: str, h5_paths: dict, parent_path: str = "instrument"):
        """Open a project folder."""
        self.project_path = Path(path)
        if not self.project_path.exists():
            raise ValueError(f"Project path does not exist: {path}")

        # Initialize TinyDB in project folder
        self.db_path = self.project_path / "xas_workbench.json"
        self.db = TinyDB(self.db_path)
        self.h5_paths = h5_paths
        self.parent_path = parent_path

    def close(self):
        """Close current project."""
        if self.db:
            self.db.close()
        self.project_path = None
        self.db_path = None
        self.db = None
        self.h5_paths = {}

    @property
    def is_open(self) -> bool:
        return self.project_path is not None and self.db is not None


# Global project state instance
_project = XASProjectState()


def get_project() -> XASProjectState:
    """Get current project, raising error if not open."""
    if not _project.is_open:
        raise HTTPException(status_code=400, detail="No project is open. Call /api/xas/project/open first.")
    return _project


# =============================================================================
# Request/Response Models
# =============================================================================

class ProjectOpenRequest(BaseModel):
    project_path: str
    beamline: str = "BM23"  # Use preset config
    h5_paths: Optional[dict] = None  # Override preset if provided
    parent_path: str = "instrument"


class ROIConfig(BaseModel):
    name: str
    display_name: str
    element: str
    numerator: str
    denominator: Optional[str] = None
    energy_min: Optional[float] = None  # keV
    energy_max: Optional[float] = None  # keV


class NormalizationRequest(BaseModel):
    sample: str
    dataset: str
    scan: str
    roi: str
    pre1: Optional[float] = None
    pre2: Optional[float] = None
    norm1: Optional[float] = None
    norm2: Optional[float] = None
    energy_shift: Optional[float] = None


class ScanParamsRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    scan: str
    pre1: Optional[float] = None
    pre2: Optional[float] = None
    norm1: Optional[float] = None
    norm2: Optional[float] = None
    status: str  # 'unreviewed', 'good', 'ignore'
    aligned: bool = False
    reference_name: Optional[str] = None
    energy_shift: Optional[float] = None


class ReferenceData(BaseModel):
    name: str
    element: str
    source_sample: str
    source_dataset: str
    scans: list[str]
    numerator: str
    denominator: Optional[str] = None
    measured_E0: float
    measured_E0_std: float
    target_E0: float
    energy_shift: float


class DerivativeRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    order: int = 1  # 1 or 2
    smoothing_window: int = 1


class PeakFitRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    n_peaks: int
    initial_guesses: list[dict]
    energy_min: float
    energy_max: float


class PeakFitSaveRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    n_peaks: int
    params: dict
    savgol_window: int = 1
    savgol_polyorder: int = 1
    energy_range: list[float]
    r_squared: float
    notes: Optional[str] = None


class ExportRequest(BaseModel):
    sample: str
    datasets: list[str]
    rois: list[str]
    format: str = "long"  # "long" or "wide"
    include_derivatives: bool = True
    include_peak_fits: bool = True


class CodeExportRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    plotting_backend: str = "matplotlib"  # "matplotlib" or "plotly"
    include_derivatives: bool = False


# =============================================================================
# Project Management Endpoints
# =============================================================================

@router.post("/project/open")
def open_project(request: ProjectOpenRequest):
    """Open an XAS project folder and initialize TinyDB."""
    global _project

    # Close existing project if open
    if _project.is_open:
        _project.close()

    # Get H5 paths config
    if request.h5_paths:
        h5_paths = request.h5_paths
    elif request.beamline in BEAMLINE_CONFIGS:
        config = BEAMLINE_CONFIGS[request.beamline]
        h5_paths = config["h5_paths"]
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown beamline '{request.beamline}'. Provide h5_paths directly."
        )

    try:
        _project.open(request.project_path, h5_paths, request.parent_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Scan for datasets and build index
    datasets = scan_h5_for_datasets(_project.project_path)

    # Store in database
    Q = Query()
    table = _project.db.table("datasets")
    for ds in datasets:
        table.upsert(
            {
                "sample": ds.sample,
                "dataset": ds.dataset,
                "h5_files": ds.h5_files,
                "valid_scans": ds.valid_scans,
            },
            (Q.sample == ds.sample) & (Q.dataset == ds.dataset)
        )

    # Initialize default ROI configs if none exist
    roi_table = _project.db.table("roi_configs")
    if len(roi_table.all()) == 0:
        default_rois = [
            {"name": "Ir_Pt_corr", "numerator": "Ir_Pt_corr", "denominator": "I0", "description": "Ir L3 edge with Pt correction"},
            {"name": "Pt_corr", "numerator": "Pt_corr", "denominator": "I0", "description": "Pt L3 edge correction"},
            {"name": "Ir2_corr", "numerator": "Ir2_corr", "denominator": "I0", "description": "Ir L3 edge alternate"},
            {"name": "Mn_corr", "numerator": "Mn_corr", "denominator": "I0", "description": "Mn K edge"},
            {"name": "Co2_corr", "numerator": "Co2_corr", "denominator": "I0", "description": "Co K edge"},
            {"name": "mu_roi", "numerator": "mu_roi", "denominator": None, "description": "Direct mu ROI"},
        ]
        for roi in default_rois:
            roi_table.insert(roi)

    # Build datasets by sample
    samples = sorted(set(ds.sample for ds in datasets))
    datasets_by_sample: dict[str, list[dict]] = {}
    for sample in samples:
        datasets_by_sample[sample] = [
            {
                "sample": ds.sample,
                "dataset": ds.dataset,
                "h5_files": ds.h5_files,
                "valid_scans": ds.valid_scans,
            }
            for ds in datasets
            if ds.sample == sample
        ]

    return {
        "project_path": str(_project.project_path),
        "db_path": str(_project.db_path) if _project.db_path else None,
        "is_open": True,
        "beamline": request.beamline,
        "samples": samples,
        "datasets": datasets_by_sample,
    }


@router.get("/project/info")
def get_project_info():
    """Get current project information."""
    proj = get_project()
    Q = Query()
    datasets = proj.db.table("datasets").all()
    samples = list(set(d["sample"] for d in datasets))

    return {
        "project_path": str(proj.project_path),
        "samples": samples,
        "total_datasets": len(datasets),
        "h5_paths": proj.h5_paths,
        "beamline_configs_available": list(BEAMLINE_CONFIGS.keys()),
    }


@router.post("/project/close")
def close_project():
    """Close current project."""
    global _project
    _project.close()
    return {"success": True}


# =============================================================================
# Sample/Dataset Navigation
# =============================================================================

@router.get("/samples")
def list_samples():
    """List all samples in current project."""
    proj = get_project()
    datasets = proj.db.table("datasets").all()
    samples = sorted(set(d["sample"] for d in datasets))
    return samples


@router.get("/datasets/{sample}")
def list_datasets(sample: str):
    """List datasets for a sample with review progress."""
    proj = get_project()
    Q = Query()

    # Get datasets for this sample
    datasets = proj.db.table("datasets").search(Q.sample == sample)

    result = []
    for ds in datasets:
        # Count reviewed scans
        scans = proj.db.table("scans").search(
            (Q.sample == sample) & (Q.dataset == ds["dataset"])
        )
        total = len(scans) if scans else 0
        reviewed = sum(1 for s in scans if s.get("status") != "unreviewed")
        good = sum(1 for s in scans if s.get("status") == "good")

        result.append({
            "dataset": ds["dataset"],
            "h5_files": ds["h5_files"],
            "scans_total": total,
            "scans_reviewed": reviewed,
            "scans_good": good,
        })

    return sorted(result, key=lambda x: x["dataset"])


@router.get("/scans/{sample}/{dataset}")
def list_scans(sample: str, dataset: str, roi: Optional[str] = None):
    """Get valid scans for a dataset."""
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == sample) & (Q.dataset == dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail=f"Dataset {sample}/{dataset} not found")

    # Get first H5 file for this dataset
    if not ds_info["h5_files"]:
        return []  # No H5 files

    h5_path = proj.project_path / ds_info["h5_files"][0]

    # Get ROI config if specified (to check for numerator)
    numerator = None
    if roi:
        roi_config = proj.db.table("roi_configs").get(Q.name == roi)
        if roi_config:
            numerator = roi_config.get("numerator")

    # Find valid scans
    valid_scans = find_valid_scans(
        h5_path,
        proj.h5_paths,
        proj.parent_path,
        numerator=numerator,
    )

    return valid_scans  # Return just the scan IDs as a list


# =============================================================================
# ROI Configuration
# =============================================================================

@router.get("/roi-configs")
def get_roi_configs():
    """Get all ROI configurations."""
    proj = get_project()
    configs = proj.db.table("roi_configs").all()
    return configs  # Return as list for frontend


@router.post("/roi-configs")
def save_roi_config(config: ROIConfig):
    """Save an ROI configuration."""
    proj = get_project()
    Q = Query()
    proj.db.table("roi_configs").upsert(
        config.model_dump(),
        Q.name == config.name
    )
    return {"success": True, "name": config.name}


@router.delete("/roi-configs/{name}")
def delete_roi_config(name: str):
    """Delete an ROI configuration."""
    proj = get_project()
    Q = Query()
    removed = proj.db.table("roi_configs").remove(Q.name == name)
    if not removed:
        raise HTTPException(status_code=404, detail=f"ROI config '{name}' not found")
    return {"success": True}


@router.get("/roi-configs/valid/{sample}/{dataset}")
def get_valid_rois_for_dataset(sample: str, dataset: str):
    """
    Get ROI configs that have data available for a specific dataset.

    Checks the H5 file to see which numerator channels actually exist.
    """
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == sample) & (Q.dataset == dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get all ROI configs
    all_configs = proj.db.table("roi_configs").all()

    # Get H5 file path
    if not ds_info["h5_files"]:
        return []

    h5_path = proj.project_path / ds_info["h5_files"][0]

    # Check which ROIs have data
    valid_configs = []
    for config in all_configs:
        numerator = config.get("numerator")
        if numerator:
            # Check if this numerator has valid scans
            scans = find_valid_scans(
                h5_path,
                proj.h5_paths,
                proj.parent_path,
                numerator=numerator,
            )
            if scans:
                config["valid_scan_count"] = len(scans)
                valid_configs.append(config)

    return valid_configs


# =============================================================================
# Normalization
# =============================================================================

@router.post("/normalize")
def normalize_scan(request: NormalizationRequest):
    """Normalize a single scan and return results."""
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == request.sample) & (Q.dataset == request.dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get ROI config
    roi_config = proj.db.table("roi_configs").get(Q.name == request.roi)
    if not roi_config:
        raise HTTPException(status_code=404, detail=f"ROI config '{request.roi}' not found")

    # Get H5 file path
    h5_path = proj.project_path / ds_info["h5_files"][0]

    try:
        result = normalize_single_scan(
            str(h5_path),
            request.scan,
            roi_config["numerator"],
            roi_config.get("denominator"),
            pre1=request.pre1,
            pre2=request.pre2,
            norm1=request.norm1,
            norm2=request.norm2,
            energy_min=roi_config.get("energy_min"),
            energy_max=roi_config.get("energy_max"),
            energy_shift=request.energy_shift,
            h5_paths=proj.h5_paths,
            parent_path=proj.parent_path,
        )
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scan-params/{sample}/{dataset}/{roi}/{scan:path}")
def get_scan_params(sample: str, dataset: str, roi: str, scan: str):
    """Get saved parameters for a scan."""
    proj = get_project()
    Q = Query()
    params = proj.db.table("scans").get(
        (Q.sample == sample) & (Q.dataset == dataset) &
        (Q.roi == roi) & (Q.scan == scan)
    )
    if not params:
        # Return empty object instead of None to avoid serialization issues
        return {}

    # Restructure to match frontend ScanParams type
    return {
        "sample": params.get("sample"),
        "dataset": params.get("dataset"),
        "roi": params.get("roi"),
        "scan": params.get("scan"),
        "status": params.get("status", "unreviewed"),
        "norm_params": {
            "pre1": params.get("pre1", -150),
            "pre2": params.get("pre2", -30),
            "norm1": params.get("norm1", 50),
            "norm2": params.get("norm2", 400),
            "e0": params.get("e0"),
            "step": params.get("step"),
        },
        "energy_shift": params.get("energy_shift", 0),
        "reference_name": params.get("reference_name"),
    }


@router.post("/scan-params")
def save_scan_params(request: ScanParamsRequest):
    """Save normalization parameters and status for a scan."""
    proj = get_project()
    Q = Query()

    doc = {
        "sample": request.sample,
        "dataset": request.dataset,
        "roi": request.roi,
        "scan": request.scan,
        "pre1": request.pre1,
        "pre2": request.pre2,
        "norm1": request.norm1,
        "norm2": request.norm2,
        "status": request.status,
        "aligned": request.aligned,
    }

    if request.aligned:
        doc["reference_name"] = request.reference_name
        doc["energy_shift"] = request.energy_shift
    else:
        # Store energy_shift even if not aligned (for manual shifts)
        doc["energy_shift"] = request.energy_shift or 0

    proj.db.table("scans").upsert(
        doc,
        (Q.sample == request.sample) & (Q.dataset == request.dataset) &
        (Q.roi == request.roi) & (Q.scan == request.scan)
    )

    # Return the full ScanParams structure so frontend state updates immediately
    return {
        "sample": request.sample,
        "dataset": request.dataset,
        "roi": request.roi,
        "scan": request.scan,
        "status": request.status,
        "norm_params": {
            "pre1": request.pre1 or -150,
            "pre2": request.pre2 or -30,
            "norm1": request.norm1 or 50,
            "norm2": request.norm2 or 400,
            "e0": None,
            "step": None,
        },
        "energy_shift": request.energy_shift or 0,
        "reference_name": request.reference_name if request.aligned else None,
    }


@router.get("/average/{sample}/{dataset}/{roi}")
def get_averaged_data(sample: str, dataset: str, roi: str):
    """Get averaged normalized data for a dataset/ROI (only 'good' scans)."""
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == sample) & (Q.dataset == dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get ROI config
    roi_config = proj.db.table("roi_configs").get(Q.name == roi)
    if not roi_config:
        raise HTTPException(status_code=404, detail=f"ROI config '{roi}' not found")

    # Get all scan params for this dataset/ROI
    scans = proj.db.table("scans").search(
        (Q.sample == sample) & (Q.dataset == dataset) & (Q.roi == roi)
    )

    scan_params_dict = {s["scan"]: s for s in scans}

    if not scan_params_dict:
        return {"error": "No scans have been reviewed for this dataset/ROI"}

    # Get H5 file path
    h5_path = proj.project_path / ds_info["h5_files"][0]

    result = average_scans_for_dataset(
        str(h5_path),
        scan_params_dict,
        roi_config["numerator"],
        roi_config.get("denominator"),
        energy_min=roi_config.get("energy_min"),
        energy_max=roi_config.get("energy_max"),
        h5_paths=proj.h5_paths,
        parent_path=proj.parent_path,
    )

    if result is None:
        return {"error": "No 'good' scans found to average"}

    # Include mean std and contribution analysis
    response = result.to_dict()
    response["mean_std"] = result.mean_std()
    response["contributions"] = result.contribution_analysis()

    return response


@router.get("/average/{sample}/{dataset}/{roi}/quality")
def get_quality_analysis(sample: str, dataset: str, roi: str):
    """
    Get quality analysis for averaged data.

    Returns which scans contribute most to variance and
    what the std would be if each scan were removed.
    """
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == sample) & (Q.dataset == dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get ROI config
    roi_config = proj.db.table("roi_configs").get(Q.name == roi)
    if not roi_config:
        raise HTTPException(status_code=404, detail=f"ROI config '{roi}' not found")

    # Get all scan params for this dataset/ROI
    scans = proj.db.table("scans").search(
        (Q.sample == sample) & (Q.dataset == dataset) & (Q.roi == roi)
    )

    scan_params_dict = {s["scan"]: s for s in scans}

    if not scan_params_dict:
        return {"error": "No scans have been reviewed for this dataset/ROI"}

    # Get H5 file path
    h5_path = proj.project_path / ds_info["h5_files"][0]

    result = average_scans_for_dataset(
        str(h5_path),
        scan_params_dict,
        roi_config["numerator"],
        roi_config.get("denominator"),
        energy_min=roi_config.get("energy_min"),
        energy_max=roi_config.get("energy_max"),
        h5_paths=proj.h5_paths,
        parent_path=proj.parent_path,
    )

    if result is None:
        return {"error": "No 'good' scans found to average"}

    return {
        "mean_std": result.mean_std(),
        "n_scans": result.n_scans,
        "scan_list": result.scan_list,
        "contributions": result.contribution_analysis(),
    }


# =============================================================================
# Bulk Operations
# =============================================================================

class BulkApplyParamsRequest(BaseModel):
    sample: str
    dataset: str
    roi: str
    scans: list[str]  # List of scan keys to apply to
    pre1: Optional[float] = None
    pre2: Optional[float] = None
    norm1: Optional[float] = None
    norm2: Optional[float] = None
    status: Optional[str] = None  # Optionally set status too
    energy_shift: Optional[float] = None


@router.post("/bulk-apply-params")
def bulk_apply_params(request: BulkApplyParamsRequest):
    """
    Apply normalization parameters to multiple scans at once.

    Only updates fields that are provided (not None).
    """
    proj = get_project()
    Q = Query()

    updated_count = 0

    for scan_key in request.scans:
        # Get existing params or create new
        existing = proj.db.table("scans").get(
            (Q.sample == request.sample) & (Q.dataset == request.dataset) &
            (Q.roi == request.roi) & (Q.scan == scan_key)
        )

        doc = {
            "sample": request.sample,
            "dataset": request.dataset,
            "roi": request.roi,
            "scan": scan_key,
            # Keep existing values if not provided
            "pre1": request.pre1 if request.pre1 is not None else (existing.get("pre1") if existing else None),
            "pre2": request.pre2 if request.pre2 is not None else (existing.get("pre2") if existing else None),
            "norm1": request.norm1 if request.norm1 is not None else (existing.get("norm1") if existing else None),
            "norm2": request.norm2 if request.norm2 is not None else (existing.get("norm2") if existing else None),
            "status": request.status if request.status is not None else (existing.get("status", "unreviewed") if existing else "unreviewed"),
            "energy_shift": request.energy_shift if request.energy_shift is not None else (existing.get("energy_shift", 0) if existing else 0),
            "aligned": existing.get("aligned", False) if existing else False,
        }

        proj.db.table("scans").upsert(
            doc,
            (Q.sample == request.sample) & (Q.dataset == request.dataset) &
            (Q.roi == request.roi) & (Q.scan == scan_key)
        )
        updated_count += 1

    return {
        "success": True,
        "updated_count": updated_count,
    }


# =============================================================================
# References
# =============================================================================

@router.get("/references")
def get_references():
    """Get all energy calibration references."""
    proj = get_project()
    refs = proj.db.table("references").all()
    return refs  # Return as list


@router.post("/references")
def save_reference(data: ReferenceData):
    """Save an energy calibration reference."""
    proj = get_project()
    Q = Query()

    doc = data.model_dump()
    doc["created_date"] = datetime.now().isoformat()

    proj.db.table("references").upsert(doc, Q.name == data.name)
    return {"success": True, "name": data.name}


@router.delete("/references/{name}")
def delete_reference(name: str):
    """Delete an energy calibration reference."""
    proj = get_project()
    Q = Query()

    # Check if reference is in use
    scans_using = proj.db.table("scans").search(Q.reference_name == name)
    if scans_using:
        raise HTTPException(
            status_code=400,
            detail=f"Reference '{name}' is used by {len(scans_using)} scans. Remove alignments first."
        )

    removed = proj.db.table("references").remove(Q.name == name)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Reference '{name}' not found")

    return {"success": True}


# =============================================================================
# Derivatives & Peak Fitting
# =============================================================================

@router.post("/derivative")
def calculate_derivative_endpoint(request: DerivativeRequest):
    """Calculate derivative of averaged data."""
    proj = get_project()

    # Get averaged data first
    avg_response = get_averaged_data(request.sample, request.dataset, request.roi)
    if "error" in avg_response:
        raise HTTPException(status_code=400, detail=avg_response["error"])

    energy = np.array(avg_response["energy"])
    norm = np.array(avg_response["norm"])

    deriv = calculate_derivative(
        energy, norm,
        order=request.order,
        smoothing_window=request.smoothing_window
    )

    return {
        "energy": energy.tolist(),
        "derivative": deriv.tolist(),
        "order": request.order,
        "e0": avg_response["e0"],
    }


@router.post("/peak-fit")
def fit_peaks_endpoint(request: PeakFitRequest):
    """Fit Lorentzian peaks to second derivative data."""
    proj = get_project()

    # Get averaged data
    avg_response = get_averaged_data(request.sample, request.dataset, request.roi)
    if "error" in avg_response:
        raise HTTPException(status_code=400, detail=avg_response["error"])

    energy = np.array(avg_response["energy"])
    norm = np.array(avg_response["norm"])

    # Calculate second derivative
    d2mu = calculate_derivative(energy, norm, order=2, smoothing_window=1)

    # Fit peaks
    result = fit_peaks(
        energy, d2mu,
        n_peaks=request.n_peaks,
        initial_guesses=request.initial_guesses,
        energy_range=(request.energy_min, request.energy_max),
    )

    return result.to_dict()


@router.post("/peak-fit/estimate")
def estimate_peak_guesses(sample: str, dataset: str, roi: str, n_peaks: int = 1):
    """Estimate initial guesses for peak fitting."""
    proj = get_project()

    # Get averaged data
    avg_response = get_averaged_data(sample, dataset, roi)
    if "error" in avg_response:
        raise HTTPException(status_code=400, detail=avg_response["error"])

    energy = np.array(avg_response["energy"])
    norm = np.array(avg_response["norm"])

    # Calculate second derivative
    d2mu = calculate_derivative(energy, norm, order=2, smoothing_window=1)

    # Estimate guesses
    guesses = estimate_initial_guesses(energy, d2mu, n_peaks)

    return {
        "initial_guesses": guesses,
        "suggested_energy_range": [
            float(avg_response["e0"]) - 20,
            float(avg_response["e0"]) + 30,
        ]
    }


@router.post("/peak-fit/save")
def save_peak_fit(request: PeakFitSaveRequest):
    """Save peak fit parameters to database."""
    proj = get_project()
    Q = Query()

    doc = {
        "sample": request.sample,
        "dataset": request.dataset,
        "roi": request.roi,
        "n_peaks": request.n_peaks,
        "params": request.params,
        "savgol_window": request.savgol_window,
        "savgol_polyorder": request.savgol_polyorder,
        "energy_range": request.energy_range,
        "r_squared": request.r_squared,
        "notes": request.notes,
        "updated_date": datetime.now().isoformat(),
    }

    proj.db.table("peak_fits").upsert(
        doc,
        (Q.sample == request.sample) & (Q.dataset == request.dataset) & (Q.roi == request.roi)
    )

    return {"success": True}


@router.get("/peak-fit/{sample}/{dataset}/{roi}")
def get_peak_fit(sample: str, dataset: str, roi: str):
    """Get saved peak fit parameters."""
    proj = get_project()
    Q = Query()
    result = proj.db.table("peak_fits").get(
        (Q.sample == sample) & (Q.dataset == dataset) & (Q.roi == roi)
    )
    return result or {}


# =============================================================================
# Export with Provenance
# =============================================================================

@router.post("/export")
def export_xas_data(request: ExportRequest):
    """Export averaged XAS data with full provenance."""
    proj = get_project()
    Q = Query()

    # Build export data
    export_data = {
        "manifest": {
            "export_date": datetime.now().isoformat(),
            "project_path": str(proj.project_path),
            "schema_version": "1.0.0",
            "sample": request.sample,
            "datasets": [],
        },
        "files": {},
    }

    for dataset_name in request.datasets:
        for roi_name in request.rois:
            # Get averaged data
            try:
                avg_data = get_averaged_data(request.sample, dataset_name, roi_name)
                if "error" in avg_data:
                    continue
            except HTTPException:
                continue

            # Get ROI config
            roi_config = proj.db.table("roi_configs").get(Q.name == roi_name)

            # Get scan params
            scans = proj.db.table("scans").search(
                (Q.sample == request.sample) & (Q.dataset == dataset_name) & (Q.roi == roi_name)
            )
            good_scans = [s for s in scans if s.get("status") == "good"]
            ignored_scans = [s for s in scans if s.get("status") == "ignore"]

            # Get reference info if aligned
            reference_used = None
            energy_shift = None
            if good_scans and good_scans[0].get("aligned"):
                ref_name = good_scans[0].get("reference_name")
                if ref_name:
                    reference_used = proj.db.table("references").get(Q.name == ref_name)
                    energy_shift = good_scans[0].get("energy_shift")

            # Get peak fit if exists
            peak_fit = proj.db.table("peak_fits").get(
                (Q.sample == request.sample) & (Q.dataset == dataset_name) & (Q.roi == roi_name)
            )

            # Build dataset manifest entry
            dataset_entry = {
                "sample": request.sample,
                "dataset": dataset_name,
                "roi": roi_name,
                "element": roi_config.get("element") if roi_config else None,
                "numerator": roi_config.get("numerator") if roi_config else None,
                "denominator": roi_config.get("denominator") if roi_config else None,
                "normalization_params": {
                    "pre1": good_scans[0].get("pre1") if good_scans else None,
                    "pre2": good_scans[0].get("pre2") if good_scans else None,
                    "norm1": good_scans[0].get("norm1") if good_scans else None,
                    "norm2": good_scans[0].get("norm2") if good_scans else None,
                },
                "scans_averaged": [s["scan"] for s in good_scans],
                "scans_ignored": [s["scan"] for s in ignored_scans],
                "e0": avg_data["e0"],
                "reference_used": reference_used["name"] if reference_used else None,
                "energy_shift": energy_shift,
            }

            if peak_fit:
                dataset_entry["peak_fit"] = {
                    "n_peaks": peak_fit.get("n_peaks"),
                    "params": peak_fit.get("params"),
                    "r_squared": peak_fit.get("r_squared"),
                }

            export_data["manifest"]["datasets"].append(dataset_entry)

            # Build CSV content with provenance header
            csv_lines = [
                f"# Sample: {request.sample}",
                f"# Dataset: {dataset_name}",
                f"# ROI: {roi_name}",
                f"# Element: {roi_config.get('element') if roi_config else 'N/A'}",
                f"# Numerator: {roi_config.get('numerator') if roi_config else 'N/A'}",
                f"# Denominator: {roi_config.get('denominator') if roi_config else 'N/A'}",
                f"# Normalization: pre1={dataset_entry['normalization_params']['pre1']}, pre2={dataset_entry['normalization_params']['pre2']}, norm1={dataset_entry['normalization_params']['norm1']}, norm2={dataset_entry['normalization_params']['norm2']}",
            ]

            if reference_used:
                csv_lines.append(f"# Reference: {reference_used['name']} (energy_shift={energy_shift:.2f} eV)")

            csv_lines.extend([
                f"# Scans averaged: {', '.join(dataset_entry['scans_averaged'])} ({len(dataset_entry['scans_averaged'])} of {len(scans)})",
                f"# E0: {avg_data['e0']:.2f} eV",
            ])

            if peak_fit:
                main_peak = peak_fit.get("params", {}).get("peak_1", {})
                if main_peak:
                    csv_lines.append(f"# Peak fit: x0={main_peak.get('x0', 'N/A'):.2f} eV (R²={peak_fit.get('r_squared', 0):.4f})")

            csv_lines.append(f"# Exported: {datetime.now().isoformat()}")
            csv_lines.append("#")

            # Add data columns
            energy = avg_data["energy"]
            norm = avg_data["norm"]

            if request.include_derivatives:
                d1 = calculate_derivative(np.array(energy), np.array(norm), order=1)
                d2 = calculate_derivative(np.array(energy), np.array(norm), order=2)
                csv_lines.append("energy_eV,norm,d1,d2")
                for i in range(len(energy)):
                    csv_lines.append(f"{energy[i]:.4f},{norm[i]:.6f},{d1[i]:.8f},{d2[i]:.10f}")
            else:
                csv_lines.append("energy_eV,norm")
                for i in range(len(energy)):
                    csv_lines.append(f"{energy[i]:.4f},{norm[i]:.6f}")

            filename = f"{request.sample}/{dataset_name}_{roi_name}.csv"
            export_data["files"][filename] = "\n".join(csv_lines)

    # Create zip file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add manifest
        zf.writestr("manifest.json", json.dumps(export_data["manifest"], indent=2))

        # Add data files
        for filename, content in export_data["files"].items():
            zf.writestr(filename, content)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=xas_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        }
    )


# =============================================================================
# Code Export (Reproducible Scripts)
# =============================================================================

@router.post("/export/code")
def export_code(request: CodeExportRequest):
    """
    Generate a standalone Python script that reproduces the XAS normalization workflow.

    The script includes all parameters and can run independently with just:
    - The H5 data file
    - numpy, h5py, larch, and matplotlib/plotly

    Data processing (sections 1-3) is separate from plotting (section 4).
    """
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == request.sample) & (Q.dataset == request.dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get ROI config
    roi_config = proj.db.table("roi_configs").get(Q.name == request.roi)
    if not roi_config:
        raise HTTPException(status_code=404, detail=f"ROI config '{request.roi}' not found")

    # Get all scan params for this dataset/ROI
    scans = proj.db.table("scans").search(
        (Q.sample == request.sample) & (Q.dataset == request.dataset) & (Q.roi == request.roi)
    )

    # Filter for good scans only
    good_scans = [s for s in scans if s.get("status") == "good"]
    if not good_scans:
        raise HTTPException(status_code=400, detail="No 'good' scans found to export")

    # Build scan_keys and scan_norm_params
    scan_keys = [s["scan"] for s in good_scans]
    scan_norm_params = {
        s["scan"]: {
            "pre1": s.get("pre1"),
            "pre2": s.get("pre2"),
            "norm1": s.get("norm1"),
            "norm2": s.get("norm2"),
        }
        for s in good_scans
    }

    # Get energy shift from first aligned scan (if any)
    energy_shift = 0.0
    for scan in good_scans:
        if scan.get("aligned") and scan.get("energy_shift"):
            energy_shift = scan["energy_shift"]
            break

    # Get H5 file path
    h5_path = proj.project_path / ds_info["h5_files"][0]

    # Generate the code
    code = generate_xas_code(
        sample=request.sample,
        dataset=request.dataset,
        roi_name=request.roi,
        element=roi_config.get("element", "Unknown"),
        h5_file=str(h5_path),
        scan_keys=scan_keys,
        scan_norm_params=scan_norm_params,
        numerator=roi_config["numerator"],
        denominator=roi_config.get("denominator"),
        h5_paths=proj.h5_paths,
        parent_path=proj.parent_path,
        energy_shift=energy_shift,
        energy_min=roi_config.get("energy_min"),
        energy_max=roi_config.get("energy_max"),
        plotting_backend=request.plotting_backend,
        include_derivatives=request.include_derivatives,
    )

    # Create filename
    filename = f"xas_{request.sample}_{request.dataset}_{request.roi}.py"

    return StreamingResponse(
        io.BytesIO(code.encode("utf-8")),
        media_type="text/x-python",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.post("/export/code-preview")
def preview_code(request: CodeExportRequest):
    """
    Preview the generated Python script without downloading.

    Returns the code as a JSON response for display in the frontend.
    """
    proj = get_project()
    Q = Query()

    # Get dataset info
    ds_info = proj.db.table("datasets").get(
        (Q.sample == request.sample) & (Q.dataset == request.dataset)
    )
    if not ds_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Get ROI config
    roi_config = proj.db.table("roi_configs").get(Q.name == request.roi)
    if not roi_config:
        raise HTTPException(status_code=404, detail=f"ROI config '{request.roi}' not found")

    # Get all scan params for this dataset/ROI
    scans = proj.db.table("scans").search(
        (Q.sample == request.sample) & (Q.dataset == request.dataset) & (Q.roi == request.roi)
    )

    # Filter for good scans only
    good_scans = [s for s in scans if s.get("status") == "good"]
    if not good_scans:
        raise HTTPException(status_code=400, detail="No 'good' scans found to export")

    # Build scan_keys and scan_norm_params
    scan_keys = [s["scan"] for s in good_scans]
    scan_norm_params = {
        s["scan"]: {
            "pre1": s.get("pre1"),
            "pre2": s.get("pre2"),
            "norm1": s.get("norm1"),
            "norm2": s.get("norm2"),
        }
        for s in good_scans
    }

    # Get energy shift from first aligned scan (if any)
    energy_shift = 0.0
    for scan in good_scans:
        if scan.get("aligned") and scan.get("energy_shift"):
            energy_shift = scan["energy_shift"]
            break

    # Get H5 file path
    h5_path = proj.project_path / ds_info["h5_files"][0]

    # Generate the code
    code = generate_xas_code(
        sample=request.sample,
        dataset=request.dataset,
        roi_name=request.roi,
        element=roi_config.get("element", "Unknown"),
        h5_file=str(h5_path),
        scan_keys=scan_keys,
        scan_norm_params=scan_norm_params,
        numerator=roi_config["numerator"],
        denominator=roi_config.get("denominator"),
        h5_paths=proj.h5_paths,
        parent_path=proj.parent_path,
        energy_shift=energy_shift,
        energy_min=roi_config.get("energy_min"),
        energy_max=roi_config.get("energy_max"),
        plotting_backend=request.plotting_backend,
        include_derivatives=request.include_derivatives,
    )

    return {
        "code": code,
        "filename": f"xas_{request.sample}_{request.dataset}_{request.roi}.py",
        "n_scans": len(scan_keys),
        "plotting_backend": request.plotting_backend,
    }


@router.get("/review-progress/{sample}/{dataset}/{roi}")
def get_review_progress(sample: str, dataset: str, roi: str):
    """Get review progress statistics for a dataset/ROI."""
    proj = get_project()
    Q = Query()

    scans = proj.db.table("scans").search(
        (Q.sample == sample) & (Q.dataset == dataset) & (Q.roi == roi)
    )

    total = len(scans)
    good = sum(1 for s in scans if s.get("status") == "good")
    ignored = sum(1 for s in scans if s.get("status") == "ignore")
    unreviewed = sum(1 for s in scans if s.get("status") == "unreviewed")

    return {
        "total": total,
        "good": good,
        "ignored": ignored,
        "unreviewed": unreviewed,
        "reviewed": good + ignored,
        "can_export": good > 0,
    }

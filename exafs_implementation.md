# Full EXAFS Workflow Implementation Plan

## Overview

Extend echem-viewer's XAS capabilities with full EXAFS analysis:
1. **Background removal** - AUTOBK algorithm via Larch
2. **χ(k) extraction** - k-space processing with weighting
3. **Fourier transforms** - χ(k) → χ(R) and back-transforms
4. **Reproducible code export** - standalone Python scripts

---

## Part A: Backend EXAFS Processing

### New File: `echem_core/xas/exafs.py`

```python
# Dataclasses
@dataclass
class EXAFSParams:
    rbkg: float = 1.0      # Background spline R distance (Å)
    kmin: float = 0        # k-space minimum (Å⁻¹)
    kmax: float | None     # k-space maximum (auto if None)
    kweight: int = 2       # k-weighting (0, 1, 2, or 3)
    dk: float = 1.0        # Window sill width
    window: str = "hanning"
    rmin: float = 0        # R-space minimum (Å)
    rmax: float = 6        # R-space maximum (Å)
    dr: float = 0.5        # R-space window sill

@dataclass
class EXAFSResult:
    # k-space
    k: np.ndarray          # k values (Å⁻¹)
    chi: np.ndarray        # χ(k)
    chi_kweighted: np.ndarray  # k^n × χ(k)

    # R-space
    r: np.ndarray          # R values (Å)
    chir_mag: np.ndarray   # |χ(R)|
    chir_re: np.ndarray    # Re[χ(R)]
    chir_im: np.ndarray    # Im[χ(R)]

    # Back-transform (q-space)
    q: np.ndarray
    chiq_mag: np.ndarray
    chiq_re: np.ndarray

    # Metadata
    params: EXAFSParams
    e0: float
    n_scans: int
    scan_list: list[str]

# Functions wrapping Larch
def extract_exafs(energy, mu, e0, params: EXAFSParams) -> EXAFSResult:
    """Extract EXAFS using Larch autobk."""
    from larch.xafs import autobk
    # ...

def forward_ft(k, chi, params: EXAFSParams) -> tuple:
    """Forward Fourier transform χ(k) → χ(R)."""
    from larch.xafs import xftf
    # Returns: (r, chir_mag, chir_re, chir_im)

def reverse_ft(r, chir, params: EXAFSParams) -> tuple:
    """Reverse Fourier transform χ(R) → χ(q)."""
    from larch.xafs import xftr
    # Returns: (q, chiq_mag, chiq_re, chiq_im)

def process_full_exafs(h5_file, scan_params_dict, roi_config, exafs_params, h5_paths, parent_path) -> EXAFSResult:
    """Full pipeline: average good scans → autobk → FT."""
```

### New API Endpoints

Add to `backend/routers/xas.py`:

```
POST /api/xas/exafs/process     - Process averaged data through EXAFS pipeline
POST /api/xas/exafs/save-params - Save EXAFS parameters to database
GET  /api/xas/exafs/params/{sample}/{dataset}/{roi} - Get saved params
```

### Database Schema

New TinyDB table: `exafs_params`
```json
{
  "sample": "SampleA",
  "dataset": "Dataset1",
  "roi": "Ir_Pt_corr",
  "rbkg": 1.0,
  "kmin": 0,
  "kmax": 12.5,
  "kweight": 2,
  "dk": 1.0,
  "window": "hanning",
  "rmin": 0,
  "rmax": 6,
  "dr": 0.5,
  "updated_date": "2025-01-30T12:00:00"
}
```

---

## Part B: Frontend (Minimal)

### New Types (`frontend/src/types/xas.ts`)

```typescript
interface EXAFSParams {
  rbkg: number;
  kmin: number;
  kmax: number | null;
  kweight: number;
  dk: number;
  window: string;
  rmin: number;
  rmax: number;
  dr: number;
}

interface EXAFSResult {
  k: number[];
  chi: number[];
  chi_kweighted: number[];
  r: number[];
  chir_mag: number[];
  chir_re: number[];
  chir_im: number[];
  params: EXAFSParams;
  e0: number;
  n_scans: number;
  scan_list: string[];
}
```

### New Components

**EXAFSControls.tsx** - Parameter inputs:
- Background: rbkg, kmin, kmax
- k-weight selector (0, 1, 2, 3)
- FT window: dk, window type dropdown
- R-space range: rmin, rmax
- Process button

**Chart Extensions** - Add modes to XASChart.tsx:
- `'chi_k'` - k-space view
- `'chi_r'` - R-space magnitude
- `'chi_r_components'` - Re/Im components

---

## Part C: Extended Code Export

When EXAFS is processed, the exported code includes additional sections:

```python
# SECTION 3b: EXAFS PROCESSING
def extract_exafs(energy, norm, e0):
    """Extract EXAFS and compute Fourier transform."""
    from larch import Group
    from larch.xafs import autobk, xftf

    dat = Group()
    dat.energy = energy
    dat.mu = norm
    dat.e0 = e0

    autobk(dat, group=dat,
           rbkg=EXAFS_PARAMS["rbkg"],
           kmin=EXAFS_PARAMS["kmin"],
           kmax=EXAFS_PARAMS["kmax"])

    xftf(dat, group=dat,
         kmin=EXAFS_PARAMS["kmin"],
         kmax=EXAFS_PARAMS["kmax"],
         kweight=EXAFS_PARAMS["kweight"],
         dk=EXAFS_PARAMS["dk"],
         window=EXAFS_PARAMS["window"])

    return dat

# SECTION 4: PLOTTING (extended for EXAFS)
def plot_exafs_analysis(dat, output_prefix="exafs"):
    """Generate 4-panel EXAFS plot."""
    # Panel A: Normalized XANES
    # Panel B: χ(k) with k-weighting
    # Panel C: |χ(R)| magnitude
    # Panel D: Re/Im χ(R) components
```

---

## Implementation Phases

### Phase 1: Backend EXAFS Core
1. Create `echem_core/xas/exafs.py`
2. Add unit tests with known reference data
3. Update `__init__.py` exports

### Phase 2: API + Database
1. Add EXAFS endpoints
2. Add TinyDB table handling
3. Integration tests

### Phase 3: Frontend (Minimal)
1. Add TypeScript types
2. Add API hook methods
3. Create EXAFSControls component
4. Extend chart with k/R-space modes

### Phase 4: Code Export Extension
1. Add EXAFS templates to codegen.py
2. Update export endpoint to include EXAFS
3. Test standalone script execution

---

## Key Larch Functions Reference

```python
from larch.xafs import (
    pre_edge,   # Normalization (already using)
    autobk,     # Background removal → χ(k)
    xftf,       # Forward FT: χ(k) → χ(R)
    xftr,       # Reverse FT: χ(R) → χ(q)
)
```

## Dependencies

No new dependencies:
- `larch` already provides all EXAFS functions
- Same scientific Python stack

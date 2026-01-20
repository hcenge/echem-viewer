# Echem-Viewer

Electrochemistry data visualization tool built with Python and React.

## File Structure

| File | Description |
|------|-------------|
| `app.py` | Main Marimo application - UI components, layout, and reactive logic |
| `gamry.py` | Gamry .DTA file parser - reads Gamry instrument files and normalizes columns |
| `codegen.py` | Python code generator - exports plot configuration as standalone scripts |
| `technique_analysis.py` | Technique-specific analysis functions (time averaging, iR intercept) |

## Supported File Formats

- **BioLogic .mpr** - via galvani library
- **Gamry .dta** - via custom parser

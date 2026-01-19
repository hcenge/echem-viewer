"""In-memory session state for single-user app."""

from dataclasses import dataclass, field
from echem_core import EchemDataset

# Limits to prevent memory issues
MAX_FILES = 100
MAX_FILE_SIZE_MB = 50


@dataclass
class SessionState:
    """Holds all session data in memory."""

    # Parsed datasets keyed by filename
    datasets: dict[str, EchemDataset] = field(default_factory=dict)

    # User-editable metadata (labels, custom columns)
    # Structure: {filename: {label: str, custom_col1: value, ...}}
    file_metadata: dict[str, dict] = field(default_factory=dict)

    def add_dataset(self, dataset: EchemDataset) -> None:
        """Add a dataset to the session."""
        self.datasets[dataset.filename] = dataset
        self.file_metadata[dataset.filename] = {
            "label": dataset.label or dataset.filename,
        }

    def remove_dataset(self, filename: str) -> None:
        """Remove a dataset from the session."""
        self.datasets.pop(filename, None)
        self.file_metadata.pop(filename, None)

    def update_metadata(self, filename: str, updates: dict) -> None:
        """Update metadata for a file.

        Setting a value to None removes that key from metadata.
        """
        if filename in self.file_metadata:
            for key, value in updates.items():
                if value is None:
                    # Remove key if value is None
                    self.file_metadata[filename].pop(key, None)
                else:
                    self.file_metadata[filename][key] = value

    def clear(self) -> None:
        """Clear all session data."""
        self.datasets.clear()
        self.file_metadata.clear()

    @property
    def file_count(self) -> int:
        """Get current number of files."""
        return len(self.datasets)

    @property
    def can_add_files(self) -> bool:
        """Check if we can add more files."""
        return self.file_count < MAX_FILES

    def files_remaining(self) -> int:
        """Get number of files that can still be added."""
        return max(0, MAX_FILES - self.file_count)

    def get_memory_estimate_mb(self) -> float:
        """Estimate memory usage of all datasets in MB."""
        total_bytes = 0
        for ds in self.datasets.values():
            # Estimate DataFrame memory: rows × columns × 8 bytes (float64)
            if ds.df is not None:
                total_bytes += ds.df.estimated_size()
        return total_bytes / (1024 * 1024)


# Global session state (single-user)
state = SessionState()

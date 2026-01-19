"""Session storage for electrochemistry data."""

import atexit
import json
import os
import shutil
import uuid
import polars as pl

from .types import EchemDataset


class DataStore:
    """Manages storage of datasets during a session.

    Stores EchemDataset objects as parquet files with JSON metadata.
    Automatically cleans up on session end.
    """

    def __init__(self, session_id: str | None = None):
        """Create store.

        Args:
            session_id: Unique session ID. If not provided, generates one.
        """
        if session_id is None:
            session_id = str(uuid.uuid4())[:8]
        self.session_id = session_id
        self.storage_dir = f"/tmp/echem_session_{session_id}"
        os.makedirs(self.storage_dir, exist_ok=True)

        # Register cleanup on exit
        atexit.register(self.cleanup)

    def _data_path(self, key: str) -> str:
        """Get path for data file."""
        safe_key = key.replace("/", "_").replace("\\", "_")
        return f"{self.storage_dir}/{safe_key}.parquet"

    def _meta_path(self, key: str) -> str:
        """Get path for metadata file."""
        safe_key = key.replace("/", "_").replace("\\", "_")
        return f"{self.storage_dir}/{safe_key}.meta.json"

    def save(self, dataset: EchemDataset) -> str:
        """Save dataset, return storage key.

        Args:
            dataset: EchemDataset to save

        Returns:
            Storage key (the filename)
        """
        key = dataset.filename

        # Save DataFrame as parquet
        dataset.df.write_parquet(self._data_path(key))

        # Save metadata as JSON (everything except df)
        meta = {
            "filename": dataset.filename,
            "columns": dataset.columns,
            "technique": dataset.technique,
            "label": dataset.label,
            "timestamp": dataset.timestamp.isoformat() if dataset.timestamp else None,
            "cycles": dataset.cycles,
            "source_format": dataset.source_format,
            "original_filename": dataset.original_filename,
            "file_hash": dataset.file_hash,
            "user_metadata": dataset.user_metadata,
        }
        with open(self._meta_path(key), "w") as f:
            json.dump(meta, f)

        return key

    def load(self, key: str) -> EchemDataset:
        """Load dataset by key.

        Args:
            key: Storage key (filename)

        Returns:
            EchemDataset

        Raises:
            FileNotFoundError: If key not found
        """
        from datetime import datetime

        df = pl.read_parquet(self._data_path(key))

        with open(self._meta_path(key)) as f:
            meta = json.load(f)

        timestamp = None
        if meta.get("timestamp"):
            timestamp = datetime.fromisoformat(meta["timestamp"])

        return EchemDataset(
            filename=meta["filename"],
            df=df,
            columns=meta["columns"],
            technique=meta.get("technique"),
            label=meta.get("label"),
            timestamp=timestamp,
            cycles=meta.get("cycles", []),
            source_format=meta.get("source_format"),
            original_filename=meta.get("original_filename"),
            file_hash=meta.get("file_hash"),
            user_metadata=meta.get("user_metadata", {}),
        )

    def list_keys(self) -> list[str]:
        """List all stored dataset keys."""
        keys = []
        for fname in os.listdir(self.storage_dir):
            if fname.endswith(".parquet"):
                keys.append(fname[:-8])  # Remove .parquet
        return keys

    def delete(self, key: str) -> None:
        """Delete a stored dataset.

        Args:
            key: Storage key to delete
        """
        data_path = self._data_path(key)
        meta_path = self._meta_path(key)

        if os.path.exists(data_path):
            os.unlink(data_path)
        if os.path.exists(meta_path):
            os.unlink(meta_path)

    def cleanup(self) -> None:
        """Clean up all stored data for this session."""
        if os.path.exists(self.storage_dir):
            shutil.rmtree(self.storage_dir, ignore_errors=True)

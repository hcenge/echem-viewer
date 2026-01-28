"""Multi-user session state with isolation and auto-cleanup."""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional

from echem_core import EchemDataset

# Limits to prevent memory issues
MAX_FILES_PER_SESSION = 100
MAX_FILE_SIZE_MB = 50
MAX_MEMORY_PER_SESSION_MB = 500  # 500 MB per session
SESSION_TTL_HOURS = 24  # Sessions expire after 24 hours
CLEANUP_INTERVAL_MINUTES = 30  # Run cleanup every 30 minutes


@dataclass
class SessionState:
    """Holds all data for a single user session."""

    session_id: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_accessed: datetime = field(default_factory=datetime.utcnow)

    # Parsed datasets keyed by filename
    datasets: dict[str, EchemDataset] = field(default_factory=dict)

    # User-editable metadata (labels, custom columns)
    # Structure: {filename: {label: str, custom_col1: value, ...}}
    file_metadata: dict[str, dict] = field(default_factory=dict)

    def touch(self) -> None:
        """Update last accessed time."""
        self.last_accessed = datetime.utcnow()

    def add_dataset(self, dataset: EchemDataset) -> None:
        """Add a dataset to the session."""
        self.touch()
        self.datasets[dataset.filename] = dataset
        self.file_metadata[dataset.filename] = {
            "label": dataset.label or dataset.filename,
        }

    def remove_dataset(self, filename: str) -> None:
        """Remove a dataset from the session."""
        self.touch()
        self.datasets.pop(filename, None)
        self.file_metadata.pop(filename, None)

    def update_metadata(self, filename: str, updates: dict) -> None:
        """Update metadata for a file.

        Setting a value to None removes that key from metadata.
        """
        self.touch()
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
        return self.file_count < MAX_FILES_PER_SESSION

    def files_remaining(self) -> int:
        """Get number of files that can still be added."""
        return max(0, MAX_FILES_PER_SESSION - self.file_count)

    def get_memory_estimate_mb(self) -> float:
        """Estimate memory usage of all datasets in MB."""
        total_bytes = 0
        for ds in self.datasets.values():
            # Estimate DataFrame memory: rows × columns × 8 bytes (float64)
            if ds.df is not None:
                total_bytes += ds.df.estimated_size()
        return total_bytes / (1024 * 1024)

    def can_add_memory(self, additional_mb: float) -> bool:
        """Check if adding more data would exceed memory limit."""
        return (self.get_memory_estimate_mb() + additional_mb) <= MAX_MEMORY_PER_SESSION_MB

    def is_expired(self) -> bool:
        """Check if this session has expired."""
        expiry_time = self.last_accessed + timedelta(hours=SESSION_TTL_HOURS)
        return datetime.utcnow() > expiry_time


class SessionManager:
    """Manages multiple user sessions with isolation and cleanup."""

    def __init__(self):
        self._sessions: dict[str, SessionState] = {}
        self._lock = Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    def create_session(self) -> str:
        """Create a new session and return its ID."""
        session_id = str(uuid.uuid4())
        with self._lock:
            self._sessions[session_id] = SessionState(session_id=session_id)
        return session_id

    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get a session by ID, or None if not found/expired."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.is_expired():
                # Clean up expired session
                del self._sessions[session_id]
                return None
            session.touch()
            return session

    def get_or_create_session(self, session_id: Optional[str]) -> tuple[str, SessionState]:
        """Get existing session or create a new one.

        Returns (session_id, session_state).
        """
        if session_id:
            session = self.get_session(session_id)
            if session:
                return session_id, session

        # Create new session
        new_id = self.create_session()
        return new_id, self._sessions[new_id]

    def delete_session(self, session_id: str) -> None:
        """Delete a session."""
        with self._lock:
            self._sessions.pop(session_id, None)

    def cleanup_expired_sessions(self) -> int:
        """Remove all expired sessions. Returns count of removed sessions."""
        removed = 0
        with self._lock:
            expired = [
                sid for sid, session in self._sessions.items()
                if session.is_expired()
            ]
            for sid in expired:
                del self._sessions[sid]
                removed += 1
        return removed

    def get_stats(self) -> dict:
        """Get global statistics about all sessions."""
        with self._lock:
            total_files = sum(s.file_count for s in self._sessions.values())
            total_memory = sum(s.get_memory_estimate_mb() for s in self._sessions.values())
            return {
                "active_sessions": len(self._sessions),
                "total_files": total_files,
                "total_memory_mb": round(total_memory, 2),
            }

    async def start_cleanup_task(self) -> None:
        """Start the background cleanup task."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop_cleanup_task(self) -> None:
        """Stop the background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    async def _cleanup_loop(self) -> None:
        """Background loop that periodically cleans up expired sessions."""
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL_MINUTES * 60)
            removed = self.cleanup_expired_sessions()
            if removed > 0:
                print(f"[Cleanup] Removed {removed} expired session(s)")


# Global session manager (replaces the old single-user state)
session_manager = SessionManager()

# Export constants for use in main.py
MAX_FILES = MAX_FILES_PER_SESSION

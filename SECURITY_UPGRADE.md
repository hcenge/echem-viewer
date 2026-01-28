# Security Upgrade - IMPLEMENTED

## Features Implemented

### 1. Session Isolation via Cookies
- Each user gets a unique session ID stored in an HTTP-only cookie (`echem_session_id`)
- Files are stored per-session - users cannot access files from other sessions
- Session ID is a UUID, making it unguessable
- Cookie settings: `httponly=True`, `samesite=lax`, `max_age=24h`

### 2. Automatic 24-hour Cleanup
- Background task runs every 30 minutes via FastAPI lifespan
- Sessions that haven't been accessed in 24 hours are automatically deleted
- All associated file data is cleaned up when a session expires

### 3. Per-Session Memory Limits
- Maximum 500 MB of data per session (`MAX_MEMORY_PER_SESSION_MB`)
- Maximum 100 files per session (`MAX_FILES_PER_SESSION`)
- Maximum 50 MB per individual file (`MAX_FILE_SIZE_MB`)
- Memory checks before uploads - rejects files that would exceed limit

## Configuration (in `backend/state.py`)

```python
MAX_FILES_PER_SESSION = 100       # Max files per user session
MAX_FILE_SIZE_MB = 50             # Max size of single uploaded file
MAX_MEMORY_PER_SESSION_MB = 500   # Max total memory per session
SESSION_TTL_HOURS = 24            # Session expires after 24h of inactivity
CLEANUP_INTERVAL_MINUTES = 30     # How often to check for expired sessions
```

## API Changes

### `/api/health` endpoint
Now returns global statistics:
- `active_sessions`: Number of active user sessions
- `total_files`: Total files across all sessions
- `total_memory_mb`: Total memory usage across all sessions

### `/stats` endpoint
Now returns per-session statistics:
- `session_id`: First 8 characters of session ID (for debugging)
- `memory_mb`: Current memory usage for this session
- `max_memory_mb`: Maximum allowed memory

## Files Modified

- `backend/state.py` - New multi-user `SessionManager` class with cleanup
- `backend/main.py` - Cookie-based session handling, lifespan for background task

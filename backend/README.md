# God Mode Tools API

This directory is the source of the minimal FastAPI service served below `/api/`.

Public contracts:

- `GET /api/` → `200 {"message":"API is running"}`
- `GET /api/health` → `200 {"status":"healthy"}`

Neither response may contain environment variables, connection strings, credentials or dependency details. The service currently has no database behavior, so the production container must not receive `DATABASE_URL`. If a future endpoint needs storage, add a scoped credential and a non-public readiness check in the same reviewed change.

Build from this directory with `docker build -t app-backend .`. Deploy by rebuilding the `backend` service and then restarting or reloading Nginx so its upstream address is refreshed. Verify both public contracts after the change.

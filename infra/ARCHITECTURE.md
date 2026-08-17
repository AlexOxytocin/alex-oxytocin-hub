# God Mode Tools web ecosystem

## Public routing

| Host | Purpose | Deployment directory |
| --- | --- | --- |
| `godmodetools.com` | Personal brand hub and services | `hub/` |
| `ai.godmodetools.com` | “ИИ по делу” training landing | `ai/` |
| `cv.godmodetools.com` | Role-aware professional profile | `cv/` |
| `allo.godmodetools.com` | “Алло, Нейросеточная?” community | `allo/` |
| `app.godmodetools.com` | Reserved for the community web app | not deployed |

Nginx serves versioned releases from `/opt/app/frontend/sites/current`.
The root host continues to proxy `/api/` to the existing backend and
`/openclaw-voice/` to the existing voice service. `/voidplayer/` remains served
from the legacy frontend directory.

## Future domain migration

Each product uses root-relative assets and its own host, so it can later move to
a separate domain by changing DNS and Nginx `server_name`; the content does not
depend on `godmodetools.com` paths.

# God Mode Tools web ecosystem

> Этот файл фиксирует текущий production до cutover. Целевой Astro foundation и его границы описаны в `docs/astro-foundation.md`.

## Public routing

| Host | Purpose | Deployment directory |
| --- | --- | --- |
| `godmodetools.com` | Personal brand hub and services | `hub/` |
| `ai.godmodetools.com` | “ИИ по делу” learning landing | `ai/` |
| `cv.godmodetools.com` | Role-aware professional profile | `cv/` |
| `allo.godmodetools.com` | “Алло, Нейросеточная?” community | `allo/` |
| `app.godmodetools.com` | Reserved for the community web app | not deployed |

Nginx serves versioned releases from `/opt/app/frontend/sites/current`.
The root host continues to proxy `/api/` to the existing backend and
`/openclaw-voice/` to the existing voice service. `/voidplayer/` remains served
from the legacy frontend directory.

The `/api/` implementation is source-controlled in `backend/`. Its public root
and health responses are fixed status contracts and must never echo environment
configuration. The current backend has no database behavior, so its production
container must not receive `DATABASE_URL`.

## Target public frontend

The repository root now owns a single static Astro build. It emits locale-first
RU/EN pages from one route registry and leaves `/`, legacy-host redirects,
`/api/`, `/voidplayer/`, and `/openclaw-voice/` status handling to Nginx. This
target is not active in production until the staged cutover in GOD-9.

## Future domain migration

Each product uses root-relative assets and its own host, so it can later move to
a separate domain by changing DNS and Nginx `server_name`; the content does not
depend on `godmodetools.com` paths.

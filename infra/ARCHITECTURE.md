# God Mode Tools web ecosystem

> Публичный production ещё работает на прежнем release. `infra/nginx/default.conf` теперь является проверяемой target-конфигурацией для staging и не должен устанавливаться до GOD-9 cutover. Текущий baseline сохранён в `docs/site-baseline.md`.

## Public routing

| Host | Purpose | Deployment directory |
| --- | --- | --- |
| `godmodetools.com` | Personal brand hub and services | `hub/` |
| `ai.godmodetools.com` | “ИИ по делу” learning landing | `ai/` |
| `cv.godmodetools.com` | Role-aware professional profile | `cv/` |
| `allo.godmodetools.com` | “Алло, Нейросеточная?” community | `allo/` |
| `app.godmodetools.com` | Reserved for the community web app | not deployed |

Nginx serves versioned releases from `/opt/app/frontend/sites/current`.
The target root host continues to proxy `/api/` to the existing backend and
serves `/voidplayer/` from the legacy frontend directory. Its
`/openclaw-voice/` namespace terminates with `410`; removal of the underlying
runtime/listener remains a separate GOD-8 operation.

The `/api/` implementation is source-controlled in `backend/`. Its public root
and health responses are fixed status contracts and must never echo environment
configuration. The current backend has no database behavior, so its production
container must not receive `DATABASE_URL`.

## Target public frontend

The repository root now owns a single static Astro build. It emits locale-first
RU/EN pages, crawl artifacts and migrated downloads from one route/contract
registry. Nginx owns `/`, exact legacy-host redirects, `/api/`, `/voidplayer/`,
the voice tombstone and terminal 404 behavior. The target static root is
`/usr/share/nginx/html/sites/current/site`; it is not active in production until
the staged cutover in GOD-9.

## Future domain migration

Legacy product hosts are redirect-only in the target contract. New public
content uses root-relative assets below `https://godmodetools.com/{locale}/`.
See `docs/seo-http-routing.md` for the exact one-hop and query-preservation rules.

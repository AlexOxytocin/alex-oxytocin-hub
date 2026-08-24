# GOD-7: SEO and HTTP routing contract

`docs/url-migration-inventory.json` is the source of truth. The implementation must not infer a broad legacy redirect when the inventory names an exact source: every recorded URL has one final status, and every redirect goes directly to its final HTTPS apex URL.

## Generated public surface

- RU and EN pages use self-canonical URLs on `https://godmodetools.com`.
- Every localized page publishes reciprocal `ru`/`en` hreflang links and `x-default` to the Russian URL. Spanish remains registered but unpublished.
- `og:url` equals canonical; social images also use the production origin.
- `/robots.txt` is a real text file and points to `/sitemap.xml`.
- `/sitemap.xml` is a single production-only URL set. It includes locale pages, project details, profile details and the preserved changelog, with reciprocal language links; it excludes ES, legacy hosts and downloads.
- The build moves each generated resume into the exact locale-first target recorded by the inventory. The former apex `/downloads/` output is removed.
- `/ru/experience/changelog/` and its EN language peer are real pages, so the CV changelog redirect does not end at a 404.
- `404.html` is crawl-safe (`noindex, nofollow`, no canonical). Nginx serves it with an actual 404 status.

## Target Nginx behavior

`infra/nginx/default.conf` is a target artifact, not an applied production change.

- Apex `/` returns `301 https://godmodetools.com/ru/`.
- `www` is redirect-only; `/` skips the apex-root hop, and other paths move directly to the same apex path.
- CV, AI and Allo accept only the exact inventory mappings. Unknown paths terminate with `404` instead of an index fallback.
- Exact redirects append `$is_args$args`, preserving the original query without adding an empty `?`.
- `/api/` proxies to the existing backend with path/query preservation. The trailing slash on `proxy_pass` deliberately maps `/api/health` to backend `/health`.
- `/voidplayer/` remains an isolated alias; missing assets cannot fall through to Astro.
- `/openclaw-voice/**` returns `410` and has no upstream in this configuration. GOD-8 still owns process, listener, secret and auto-start teardown on the host.
- The frontend catchall is `try_files $uri $uri/ $uri/index.html =404`; there is no SPA fallback.
- The GOD-6 compression and cache policies remain active: fingerprinted `/_astro/` assets are immutable, route HTML revalidates, and final locale-first resume downloads use bounded caching.
- Cache locations re-include the security-header policy explicitly because Nginx 1.27 does not inherit parent `add_header` directives when a location sets `Cache-Control`.

Plain HTTP requests for known records resolve directly to the final HTTPS target. Terminal inventory representatives (`404` and `410`) do not redirect. ACME challenge paths remain available for certificate renewal.

## Automated verification

```bash
npm ci
python -m pip install -r backend/requirements.txt
npx playwright install chromium
npm test
```

`npm test` builds the target, runs schema/content/SEO/config/API checks, starts an Astro preview on an available local port, and executes deterministic Chromium smoke tests. It never contacts the live production site.

For real Nginx semantics, with Docker Engine running:

```bash
npm run test:http:nginx
```

The runner creates a one-day self-signed certificate, starts isolated Nginx and backend containers on available host ports, mounts the built `dist/` and a minimal VoidPlayer fixture, then checks every inventory record over HTTPS plus direct-final behavior over HTTP. It always removes the containers, volumes and temporary certificate afterward. CI runs both commands.

An already deployed staging target can be tested without the fixture:

```bash
HTTP_CONTRACT_URL=https://staging-address HTTP_REDIRECT_URL=http://staging-address \
  node --test tests/god7-http-routing.test.mjs
```

The target must accept the production Host header for this smoke. Do not point these variables at production during GOD-7.

## Cutover boundary and remaining risk

This Story changes source, tests and the staged target only. It does not reload Nginx, change DNS, upload a release, stop services or enable permanent redirects publicly. Before GOD-9 installs the config, staging must pass the full matrix, the current release/config must be retained as a rollback boundary, and the final public URL probe must be repeated after the approved cutover.

# GOD-6 — performance, assets, and caching

## Delivery model

The unified site is static HTML with one shared CSS asset. Content routes hydrate no framework runtime. The home page keeps only its opt-in inline ambient-canvas module, governed by reduced-motion, viewport, visibility, and device-capability checks.

Images used by the unified pages live under `src/assets/` and render through Astro `Picture`. The build emits content-hashed AVIF, WebP, and fallback candidates with explicit dimensions, `srcset`, `sizes`, and lazy loading for project cards. Hero and Community LCP candidates load eagerly.

The font stack uses local system fonts. This is deliberately a zero-request alternative to shipping separate Cyrillic and Latin subsets, so there is no font preload or render-blocking font transfer.

## Budgets

The executable source of truth is `config/performance-budgets.json`:

- ordinary responsive images: at most 100 KB mobile and 200 KB desktop;
- Home first load: at most 1 MB and 15 requests;
- Projects first load: at most 1.5 MB and 25 requests;
- HTML: at most 25 KB gzip;
- route CSS: at most 50 KB gzip;
- simple-page JavaScript: at most 60 KB gzip;
- mobile targets: LCP 2.5 s, CLS 0.1, INP 200 ms.

The local mobile Chromium baseline after GOD-6 is conservative because response bodies are counted decompressed:

| Route | Transfer | Requests | Lab LCP | CLS | Interaction |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/ru/` | 34.5 KB | 3 | 1.59 s | 0.000 | 16 ms |
| `/ru/projects/` | 123.8 KB | 4 | 52 ms | 0.000 | 16 ms |

CI lab metrics catch deterministic regressions. The Playwright INP probe clicks a real header navigation control while suppressing only the resulting navigation, so future handlers on that control remain part of the measurement. The p75 values remain production targets and require field/RUM data after cutover; a single local run is not represented as real-user p75 evidence.

## Cache and compression policy

`infra/nginx/includes/site-cache.conf` is the target server include:

- `/_astro/`: `Cache-Control: public, max-age=31536000, immutable` and exact-file 404s;
- HTML routes: `Cache-Control: no-cache` and no SPA soft-404 fallback;
- stable favicon/download names: bounded one-day cache.

`infra/nginx/includes/compression.conf` enables gzip for compressible text formats. Brotli is an optional host-level enhancement because it depends on an Nginx module; enabling an unavailable directive would make `nginx -t` fail.

The includes are versioned now and are activated with the unified server block during GOD-9 cutover. Existing production routing remains unchanged in this story.

## Automated gates

- `npm test` builds the site and checks static performance budgets and every generated asset reference.
- `npm run test:performance-browser` checks mobile transfer, request counts, image responses, 4xx/5xx failures, overflow, and lab vitals.
- `.github/workflows/quality.yml` runs the full build, security, browser, and performance suite on every PR and main push.

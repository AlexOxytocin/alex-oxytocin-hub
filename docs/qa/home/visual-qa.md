# Home visual QA

Date: 2026-08-24

Branch: `codex/GOD-11-home-legacy-parity`

Scope: `/ru/` and `/en/` Home only. No production deployment was performed.

## Source evidence

- RU restored-production baselines: [`home-ru-desktop.png`](../../baseline-screenshots/home-ru-desktop.png), [`home-ru-tablet.png`](../../baseline-screenshots/home-ru-tablet.png), [`home-ru-mobile.png`](../../baseline-screenshots/home-ru-mobile.png).
- EN restored-production baselines: [`home-en-desktop.png`](../../baseline-screenshots/home-en-desktop.png), [`home-en-tablet.png`](../../baseline-screenshots/home-en-tablet.png), [`home-en-mobile.png`](../../baseline-screenshots/home-en-mobile.png).
- Legacy implementation: commit `96fc66c`, including `sites/hub/index.html`, `sites/hub/en/index.html`, `app/globals.css`, and `shared/ecosystem-nav.css`.
- Historical JPEGs remain in `docs/baseline-screenshots`. The old 375px JPEG records a wider layout cropped to the viewport, unlike both the restored public Home and the fresh fixed-viewport evidence; it is retained as evidence but is not an exception path in the regression test.

## Pixel comparison

Command: `npm run test:home:visual`

Rendering contract: Chromium, device scale factor 1, reduced motion, dark color scheme, hidden scrollbars, viewport-only screenshot, Pixelmatch threshold 0.1 with antialias-only pixels excluded.

Release limit: 1.500% per locale/viewport. A missing or dimensionally incorrect baseline fails before comparison.

| Locale | Viewport | Mismatched pixels | Ratio | After |
| --- | --- | ---: | ---: | --- |
| RU | 1440×900 | 8,953 | 0.691% | [`ru-desktop.png`](after/ru-desktop.png) |
| RU | 768×1024 | 526 | 0.067% | [`ru-tablet.png`](after/ru-tablet.png) |
| RU | 375×812 | 1,195 | 0.392% | [`ru-mobile.png`](after/ru-mobile.png) |
| EN | 1440×900 | 8,217 | 0.634% | [`en-desktop.png`](after/en-desktop.png) |
| EN | 768×1024 | 495 | 0.063% | [`en-tablet.png`](after/en-tablet.png) |
| EN | 375×812 | 1,116 | 0.367% | [`en-mobile.png`](after/en-mobile.png) |

Result: **PASS** for all six required comparisons.

## Functional and accessibility checks

- Exactly one exposed `h1`, zero Home scripts, and no horizontal document overflow at all six locale/viewports.
- Header navigation resolves to the five locale-first route helpers in the expected order; the alternate locale Home returns 200; the final navigation item remains reachable by horizontal scrolling on tablet/mobile.
- Console errors, uncaught page errors, failed requests, and HTTP 4xx/5xx subresource responses: zero.
- Axe serious/critical violations: zero at all six locale/viewports. This automated result is a basic gate, not a substitute for a full manual accessibility audit.
- Desktop keyboard order begins with the skip link and then the localized Home brand link.
- `prefers-reduced-motion` disables Home transitions; the page has no canvas or motion controller.

## Scope and regression checks

- The legacy visual theme is activated only by `data-theme="legacy-home"`; palette, font stack, backgrounds/assets, radii, shadows, spacing, and type scale live in the centralized Home theme/asset registry.
- Generic page markup and generic theme tokens were not changed. Shared header/footer changes are explicit `legacy-home` variants.
- Existing localized content-browser coverage passed for Home, Experience, Projects, Learning, Community, project detail pages, media, downloads, locale switching, and responsive overflow.
- Existing performance, critical-CSS, HTTP, SEO, and browser contracts passed. Home remained zero-JS; measured `/ru/` transfer was 139.6 KB over five requests with CLS 0.000 in the local browser gate.
- GitHub Actions keeps the general suite on Ubuntu and runs the required source-image pixel gate on `windows-2025`, matching the legacy Segoe UI rendering platform instead of weakening the threshold for Linux font fallback.

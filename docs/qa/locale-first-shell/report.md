# Locale-first placeholder shell — QA report

Date: 2026-08-24  
Target: local Astro static preview (no staging or production actions)

## Outcome

- RU/EN Home remained zero-JS and passed its protected pixel baselines at desktop, tablet, and mobile.
- Experience, Projects, Learning, and Community passed 24 browser route checks: 4 sections × 2 locales × 3 viewports.
- Each placeholder returned 200, exposed one localized `h1` and one migration status, published `noindex, follow`, used registry navigation/locale switching, and had no horizontal overflow.
- Representative résumé profile, changelog, and project detail paths returned real 404 responses.
- The isolated Docker/Nginx contract passed all 49 HTTPS inventory checks and all 49 plain-HTTP policy checks; no production endpoint was contacted.
- Console errors: 0. Page errors: 0. Failed requests on rendered placeholder pages: 0.
- Axe serious/critical violations: 0 across all 24 route checks. Desktop keyboard entry reached the skip link and then the Home brand.

## Matrix and screenshots

| Locale | Desktop 1440×900 | Tablet 768×1024 | Mobile 375×812 |
| --- | --- | --- | --- |
| RU | [ru-desktop.png](screenshots/ru-desktop.png) | [ru-tablet.png](screenshots/ru-tablet.png) | [ru-mobile.png](screenshots/ru-mobile.png) |
| EN | [en-desktop.png](screenshots/en-desktop.png) | [en-tablet.png](screenshots/en-tablet.png) | [en-mobile.png](screenshots/en-mobile.png) |

The machine-readable matrix is in [report.json](screenshots/report.json).

## Home visual regression

| Locale | Desktop | Tablet | Mobile |
| --- | ---: | ---: | ---: |
| RU | 0.054% | 0.011% | 0.392% |
| EN | 0.054% | 0.011% | 0.367% |

All six results stayed below the protected release thresholds.

## Performance probes

- `/ru/`: 133.0 KB, 5 requests, LCP 520 ms, CLS 0.000, INP 16 ms.
- `/ru/projects/`: 15.2 KB, 1 request, LCP 44 ms, CLS 0.000, INP 16 ms.
- Inline critical CSS passed the controlled render-blocking comparison.

## Verdict

Functional and accessibility verdict: **SHIP** for PR review. Placeholder visual-regression status is **INCONCLUSIVE** because this is the first candidate baseline; the complete screenshot matrix is supplied for owner review. No deployment was attempted.

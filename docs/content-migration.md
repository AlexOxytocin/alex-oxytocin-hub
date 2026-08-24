# Locale-first content boundary

## Current public surface

Home is the only completed content route. Russian and English remain available at `/{locale}/` with the protected legacy visual theme.

The four top-level sections are intentionally minimal migration placeholders:

- `/{locale}/experience/`
- `/{locale}/projects/`
- `/{locale}/learning/`
- `/{locale}/community/`

Each placeholder renders the shared header and footer, one meaningful `h1`, and one short localized migration status. It is zero-JS and publishes `noindex, follow` until reviewed content is migrated.

## Routing boundary

`src/config/routes.ts` is the source of truth for route segments, lifecycle state, robots policy, navigation, locale switching, and the nested-route contract.

Project details, résumé profile pages, and the former changelog are not generated. Direct nested page requests return a real 404 through the static HTTP fallback. Legacy Java-profile and changelog entry points redirect to the corresponding top-level Experience placeholder, so an inbound redirect never lands on a missing page.

Existing PDF, DOCX, and TXT résumé files remain exact download artifacts. They are not linked from the placeholder and do not create an HTML detail page.

## Style boundary

The new shell maps font families, background, palette, spacing, radii, and type scale in `src/styles/themes/site-shell.css`. Placeholder styles live in `src/styles/placeholder.css`. Home keeps its own `legacy-home` theme and route-local CSS; placeholder output must contain no `--home-*` tokens or `.home-*` selectors.

## Verification

- Static tests check the eight placeholder pages, robots metadata, localized headings/statuses, registry links, sitemap exclusion, zero-JS, and absent detail HTML.
- Browser QA checks four sections across RU/EN and desktop/tablet/mobile: 24 route renders, axe serious/critical violations, keyboard entry, horizontal overflow, console/network errors, locale switching, and representative detail 404s.
- The protected Home visual suite compares RU/EN at the same three viewports against versioned pixel baselines.

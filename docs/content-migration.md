# GOD-5 — content migration

## Outcome

The public material now has one source and one static Astro build. Russian and English are published independently under locale-first URLs; Spanish remains registered but unpublished until real translations exist.

Published routes:

- `/{locale}/`
- `/{locale}/experience/`
- `/{locale}/experience/java/`
- `/{locale}/projects/`
- `/{locale}/projects/{slug}/`
- `/{locale}/learning/`
- `/{locale}/community/`

With two published locales and fourteen projects, the build emits 40 public content pages plus the custom 404 page.

## Content ownership

- Page copy lives in `src/content/pages/{locale}/` and is validated by route-specific schemas.
- CV data lives in `src/content/cv/`; the website and downloadable résumés use the same source.
- Project records live in `src/content/showcase/projects_{locale}.yaml`.
- Shared page composition lives in `src/components/pages/`.
- Nested URLs are generated only by `profilePath()` and `projectPath()` from the central route registry.

This separation keeps design replaceable: a future visual redesign changes shared components, tokens, and styles without duplicating or rewriting the content model.

## Locale rules

- RU and EN contain complete authored copy. English Learning is not a Russian fallback.
- Detail-page locale switching preserves the current profile or project slug.
- No ES URL is generated while Spanish content is unpublished.
- Links that previously pointed at `cv.`, `ai.`, or `allo.godmodetools.com` are resolved to locale-first paths in the unified site.

## Preserved artifacts

- Four CV variants are available as PDF, DOCX, and TXT: RU/EN base and RU/EN Java.
- Fourteen showcase images are served from `/media/showcase/`.
- Legacy sites remain unchanged until the final cutover story.

## Verification

- `npm test`
- `npm run test:browser`
- `npm run test:content-browser`
- `npm run audit`
- `npm run test:plan`
- `npm run test:backend-security`

The content suite verifies route completeness, real RU/EN copy, project parity, nested canonical/hreflang URLs, downloads, and absence of retired content-subdomain links. Browser QA covers desktop and mobile layouts, media responses, downloads, detail locale switching, motion policy, zero-JS content routes, overflow, and the custom 404.

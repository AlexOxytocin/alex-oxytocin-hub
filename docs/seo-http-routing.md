# SEO and HTTP routing contract

`docs/url-migration-inventory.json` remains the source of truth for legacy HTTP behavior. Every redirect goes directly to its final HTTPS apex URL and preserves the original query.

## Crawl surface

- RU and EN Home publish self-canonical URLs, reciprocal hreflang links, and `x-default` to Russian.
- Top-level Experience, Projects, Learning, and Community placeholders publish canonical/hreflang metadata plus `noindex, follow`.
- Because placeholders are not indexable, `/sitemap.xml` contains Home URLs only.
- Spanish stays registered but unpublished.
- `404.html` remains `noindex, nofollow`, without a canonical URL, and is served with status 404.

## Detail routes

Project details, résumé profile pages, and changelog pages are deliberately absent from the static build and sitemap. Representative direct paths terminate with 404; they do not use an HTML fallback or a client redirect.

Legacy CV Java and changelog URLs redirect once to the localized top-level Experience placeholder. Exact résumé download redirects remain available because the download artifacts still ship at their established locale-first paths.

## Deployment boundary

`infra/nginx/default.conf` is a target artifact only. This change does not upload a release, reload Nginx, change DNS, switch a symlink, or contact production. Public readiness still requires a separately approved staging and cutover workflow.

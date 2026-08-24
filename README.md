# God Mode Tools

Единый static-first сайт для `godmodetools.com`: Astro 7, строгий TypeScript, locale-first маршруты и schema-validated content.

## Локальный запуск

Требуется Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm test
```

`npm run build` сначала собирает CV-артефакты, затем выполняет `astro check`, статическую генерацию и раскладывает downloads по финальным locale-first URL из migration inventory.

## Архитектура

- `src/config/routes.ts` — единственный API для внутренних URL;
- `src/content/locales.json` — RU/EN опубликованы, ES зарезервирован;
- `src/content.config.ts` — схемы локалей, страниц, профилей, проектов и CV;
- `src/layouts/BaseLayout.astro` — общий документ и layout;
- `src/components/SEO.astro` — canonical, hreflang и social metadata;
- `src/components/SiteHeader.astro` — общая навигация и language switcher;
- `src/styles/tokens.css` и `src/components/ui/` — централизованная дизайн-система;
- `src/components/motion/` — opt-in motion boundaries со static fallback;
- `scripts/cv/` — прежний YAML/DOCX/TXT/PDF pipeline, теперь управляемый из корня;
- `backend/` — отдельный минимальный FastAPI-контракт для `/api/`.

Обычные страницы генерируют HTML и CSS без клиентского JavaScript. Интерактивные islands можно добавлять локально, не превращая весь сайт в runtime-приложение.

## Команды

- `npm run dev` — Astro dev server;
- `npm run build` — полный воспроизводимый static build;
- `npm test` — полный build, static/HTTP contracts и автоматический Chromium smoke на локальном preview;
- `npm run test:http:nginx` — изолированный Docker smoke реального target Nginx, backend и VoidPlayer fixture;
- `npm run test:plan` — URL migration contracts;
- `npm run test:backend-security` — security regression API;
- `npm run test:design` — tokens, primitives и motion contracts;
- `npm run test:browser` — Chromium QA для desktop/reduced-motion/mobile;
- `npm run release:plan` — read-only проверка самодостаточного release payload;
- `npm run release:prepare -- --release-id <id> --confirm <id>` — explicit local apply для immutable artifact;
- `npm run verify:god9` — staging/public/direct-origin release verifier;
- `npm run resume:pdf` — PDF-экспорт CV через Playwright;

Подробности решения: `docs/astro-foundation.md`. Полная программа миграции: `docs/site-modernization-plan.md`.

## Production

Новый Astro build и [target Nginx config](infra/nginx/default.conf) пока не применены в production. Текущий публичный релиз остаётся rollback-границей до отдельного staging/cutover change window; `/api/` и `/voidplayer/` сохраняются как отдельные Nginx-контракты. Полный dry-run/apply/rollback/cleanup порядок: [GOD-9 runbook](docs/runbooks/GOD-9-staging-cutover-cleanup.md). HTTP-матрица: [docs/seo-http-routing.md](docs/seo-http-routing.md).

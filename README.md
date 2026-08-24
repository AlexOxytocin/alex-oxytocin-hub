# God Mode Tools

Единый static-first сайт для `godmodetools.com`: Astro 7, строгий TypeScript, locale-first маршруты и schema-validated content.

## Локальный запуск

Требуется Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm test
```

`npm run build` сначала собирает CV-артефакты, затем выполняет `astro check` и статическую генерацию в `dist/`.

## Архитектура

- `src/config/routes.ts` — единственный API для внутренних URL;
- `src/content/locales.json` — RU/EN опубликованы, ES зарезервирован;
- `src/content.config.ts` — схемы локалей, страниц, профилей, проектов и CV;
- `src/layouts/BaseLayout.astro` — общий документ и layout;
- `src/components/SEO.astro` — canonical, hreflang и social metadata;
- `src/components/SiteHeader.astro` — общая навигация и language switcher;
- `scripts/cv/` — прежний YAML/DOCX/TXT/PDF pipeline, теперь управляемый из корня;
- `backend/` — отдельный минимальный FastAPI-контракт для `/api/`.

Обычные страницы генерируют HTML и CSS без клиентского JavaScript. Интерактивные islands можно добавлять локально, не превращая весь сайт в runtime-приложение.

## Команды

- `npm run dev` — Astro dev server;
- `npm run build` — полный воспроизводимый static build;
- `npm test` — build и регрессия foundation;
- `npm run test:plan` — URL migration contracts;
- `npm run test:backend-security` — security regression API;
- `npm run resume:pdf` — PDF-экспорт CV через Playwright;
- `npm run legacy:ai:build` — временная сборка legacy AI-страницы до GOD-5/GOD-9.

Подробности решения: `docs/astro-foundation.md`. Полная программа миграции: `docs/site-modernization-plan.md`.

## Production

Новый Astro build пока не является production-сайтом. Текущий публичный релиз остаётся rollback-границей до staging/cutover в GOD-9; `/api/` и `/voidplayer/` сохраняются как отдельные Nginx-контракты.

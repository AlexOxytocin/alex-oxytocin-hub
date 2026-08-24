# GOD-3: единый Astro foundation

## Результат

Корень репозитория является единственным frontend-проектом и собирает статический public shell командой `npm run build`. Активный frontend не зависит от React, Vinext или Cloudflare Worker runtime. Старый production пока не меняется и остаётся rollback-границей до cutover в GOD-9.

Astro 5 был первоначальной целевой версией плана. Во время реализации `npm audit` обнаружил известные XSS/SSRF advisories в этой major-линии, поэтому foundation переведён на Astro 7.2.4 до первого деплоя. После обновления и исправления транзитивных зависимостей `npm audit` возвращает 0 vulnerabilities.

## Единые точки управления

| Ответственность | Источник |
| --- | --- |
| Домены и общие параметры сайта | `src/config/site.ts` |
| Локали и статус публикации | `src/content/locales.json` |
| Route IDs, сегменты и генерация URL | `src/config/routes.ts` |
| Content Collections и validation schemas | `src/content.config.ts` |
| Общий HTML-каркас | `src/layouts/BaseLayout.astro` |
| Общий SEO head | `src/components/SEO.astro` |
| Общая навигация и language switcher | `src/components/SiteHeader.astro` |
| Временный foundation CSS | `src/styles/foundation.css` |

GOD-4 заменит временный CSS полноценными design tokens, primitives и motion API. Страницы уже используют общий layout и components, поэтому смена визуального языка не потребует обхода каждого маршрута.

## Маршруты и языки

Публикуются только locale-first URL:

- `/ru/`, `/ru/experience/`, `/ru/projects/`, `/ru/learning/`, `/ru/community/`;
- `/en/`, `/en/experience/`, `/en/projects/`, `/en/learning/`, `/en/community/`.

Испанский зарегистрирован как `es`, но имеет `published: false`. Чтобы включить его позже, нужно добавить валидные ES content entries для всех route IDs и только затем переключить флаг публикации. URL создаются функцией `routePath()`; компоненты не собирают пути вручную.

Корневой `/` намеренно не генерирует HTML: прямой `301 / -> /ru/` является HTTP-контрактом Nginx и будет включён в GOD-7/GOD-9. Astro генерирует настоящий `404.html` с `noindex`.

## Контент и CV pipeline

Astro Content Layer валидирует пять коллекций:

- `locales`;
- `pages`;
- `profiles`;
- `projects`;
- `cv`.

Существующие CV, profiles и showcase YAML перенесены из вложенного CV-проекта в корневой `src/content/` без изменения данных. Генераторы находятся в `scripts/cv/`; `npm run build` создаёт merged YAML и TXT/DOCX downloads до Astro build. PDF остаётся отдельной командой `npm run resume:pdf`, потому что требует браузерный runtime Playwright.

## Команды проверки

```text
npm run build
npm test
npm run test:plan
npm run test:backend-security
npm audit
```

`npm test` проверяет десять опубликованных страниц, отсутствие `/es/`, canonical/hreflang, навигацию, отсутствие клиентского JavaScript в shell, реальный 404, единственный package/lockfile и выпуск CV downloads.

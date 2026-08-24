# План модернизации godmodetools.com

## 1. Цель и границы

Собрать публичные разделы God Mode Tools в один быстрый статический сайт на `godmodetools.com`, с единым интерфейсом, управляемыми языками и устойчивой SEO-моделью. Целевой стек публичного сайта — актуальная поддерживаемая версия Astro со статической генерацией. На этапе GOD-3 выбран Astro 7.2.4: первоначально запланированная ветка Astro 5 имела известные high-severity advisories и была заменена до production cutover. Отдельными техническими контрактами остаются `/api/` и `/voidplayer/`; они не являются частью frontend-миграции.

Новая архитектура не обязана менять смысл страниц или объединять backend-сервисы. Её задача — убрать разрозненные поддомены, дублирование кода и проблемные маршруты, сохранить существующий контент, обеспечить безопасную миграцию старых ссылок и заложить основу для дальнейшего дизайна и анимаций.

## 2. Исходный аудит

### Публичные поверхности

| Поверхность | Содержимое | Проблема |
| --- | --- | --- |
| `godmodetools.com` | главная, русская и английская вариации | одновременно существуют несколько источников реализации главной |
| `cv.godmodetools.com` | CV, Java, портфолио, документы резюме | контент и язык живут по собственной URL-схеме |
| `ai.godmodetools.com` | «ИИ по делу» | отдельный builder и Worker; production canonical/OG/robots/sitemap указывали на технический Worker origin |
| `allo.godmodetools.com` | «Алло, Нейросеточная?» | отдельная статическая реализация и повтор навигации |
| `/api/`, `/voidplayer/` | API и legacy-инструмент | их нужно сохранить и отдельно проверять при релизе |
| `/openclaw-voice/` | устаревший voice-сервис | публичный путь не должен продолжать обслуживать сервис |

### Текущая техническая картина

- root `app/` использует React + Vinext + Vite + Cloudflare Worker, но production не опирается на него как на единственный frontend;
- CV уже построен на Astro и содержит наиболее зрелую модель структурированного контента и генерацию PDF/DOCX/TXT;
- Learning работает через кастомный Node-builder, HTML/CSS/JS и отдельный Worker;
- Community и Hub представлены отдельными статическими реализациями;
- release-скрипт склеивает несколько независимых папок, а Nginx обслуживает несколько vhost и fallback-правила.

### Обнаруженные риски

- многие неизвестные URL возвращают `200` с главной вместо настоящего `404` (soft-404);
- запросы к `robots.txt` и sitemap могут попадать в HTML fallback;
- `www` может отдавать копию сайта с `200`, а не один прямой редирект на apex;
- английский URL Learning технически существует, но может показывать русский контент;
- canonical и `hreflang` разнородны; changelog имеет неверный canonical;
- ссылки и навигация продублированы в нескольких приложениях;
- `openclaw-voice` всё ещё может присутствовать в серверной конфигурации как upstream даже при неработающем публичном URL.

### Наблюдения по производительности

Аудит в Chromium — это лабораторная desktop-проверка, а не полевые Core Web Vitals. HTML/CSS/JS уже относительно лёгкие, а главный вес создают медиа, шрифты и кэширование.

| Маршрут | Первая загрузка | Запросы | Основной вес |
| --- | ---: | ---: | --- |
| главная | около 2.35 MB | 7 | фон 1.31 MB, hero 722 KB, logo 310 KB |
| CV | около 1.32 MB | 6 | фон 1.31 MB |
| Projects | около 2.43 MB | 14 | фон и изображения карточек |
| Learning | 114–166 KB | 13–14 | несколько font subset |
| Community | около 1.32 MB | 7 | фон 1.31 MB |

Вывод: переезд на другой framework сам по себе не улучшит скорость. Нужны единый image pipeline, строгий кэш и контроль клиентского JavaScript.

## 3. Целевая URL- и языковая модель

Язык всегда стоит первым сегментом URL. Это прозрачнее для навигации, SEO и последующего добавления языков, чем схема `/learning/en/`.

```text
godmodetools.com/
├── /                          301 → /ru/
├── /ru/
│   ├── /experience/
│   │   ├── /java/
│   │   └── /downloads/
│   ├── /projects/
│   │   └── /{slug}/
│   ├── /learning/
│   └── /community/
├── /en/                       те же разделы с английским контентом
└── /es/                       будущая структура; страницы создаются после перевода
```

- `/` постоянно перенаправляет на `/ru/`: русский — текущий основной язык.
- Страна и браузерный язык не меняют URL автоматически. Выбранная человеком страница должна быть стабильной и воспроизводимой.
- Реестр локалей включает `ru`, `en`, `es`, но испанские страницы, ссылки в меню, sitemap и `hreflang` публикуются только после готового перевода.
- Нельзя отдавать русскую страницу под `/en/` или `/es/`. Если перевода нет — страницы нет.
- Переключатель языка сохраняет раздел и slug: `/ru/projects/foo/` → `/en/projects/foo/`, если обе версии существуют; для отсутствующего перевода нужен явно определённый UX, а не скрытая подмена языка.

## 4. Единый frontend-стек

### Выбор

Публичный сайт переносится на **Astro 7 + TypeScript strict + static generation**. Это наиболее подходящая модель для контентного сайта: быстрый HTML, нулевая гидрация для обычных компонентов и возможность подключать интерактивность локально там, где она нужна. Версия framework фиксируется точным номером в корневом package manifest и обновляется только через проверяемый PR.

React/Vinext не остаётся вторым frontend runtime для публичных страниц. Astro не запрещает React-компоненты, но они подключаются только при обоснованной интерактивности, а не как оболочка всего сайта.

### Предлагаемая структура

```text
site/
├── astro.config.mjs
├── package.json                 один lockfile и один build
├── src/
│   ├── pages/[locale]/
│   │   ├── index.astro
│   │   ├── experience/
│   │   ├── projects/
│   │   ├── learning/
│   │   └── community/
│   ├── layouts/BaseLayout.astro
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── LocaleSwitcher.astro
│   │   ├── SeoHead.astro
│   │   ├── ui/
│   │   └── motion/
│   ├── content/                 collections + schema validation
│   ├── lib/locales.ts
│   ├── lib/routes.ts
│   ├── lib/seo.ts
│   └── styles/
│       ├── tokens.css
│       ├── global.css
│       ├── components/
│       └── motion-tokens.css
├── public/
├── scripts/
└── tests/
```

Единый registry хранит разрешённые языки, разделы, production origin и URL-генератор: `urlFor('en', 'learning') → /en/learning/`. Он заменяет ручные `/en`, условные проверки только `ru/en`, жёсткие поддомены и ссылки на staging/Worker origin.

Контент отделяется от UI: Astro Content Collections с validation schema для страниц, резюме, проектов и их локализаций. Нынешнюю генерацию CV-документов адаптировать в общий build, сохраняя существующие форматы и загрузки.

## 5. Дизайн-система и анимации

Единый стек не делает сайт визуально однообразным. Он даёт общую основу, на которой каждая секция может иметь свой характер без копирования навигации, типографики и механики.

- Общие design tokens: цвета, типографика, spacing, сетка, радиусы, elevation, states и breakpoints.
- Общие компоненты: Header, Footer, locale switcher, кнопки, карточки, CTA, формы, SEO-head.
- Motion-слой: CSS transitions, SVG, Canvas/WebGL, scroll-driven эффекты, GSAP/Three.js при необходимости.
- Тяжёлые эффекты оформляются изолированными компонентами `components/motion/` и загружаются только на нужном маршруте/после попадания в viewport.
- Каждый эффект получает статичный fallback, `prefers-reduced-motion`, паузу в скрытой вкладке, ограничение FPS и device pixel ratio, а также запрет блокировать LCP или сдвигать контент.
- Для статичных блоков не допускается клиентская гидрация «на всякий случай».

## 6. Производительность и delivery

### Обязательные меры

- Конвертировать фото и иллюстрации в responsive AVIF/WebP; не загружать desktop originals на мобильных.
- Использовать Astro Image, width/height и правильные `sizes`, чтобы исключить CLS и лишний вес.
- Уменьшить фон `community-network` примерно с 1.31 MB до 100–200 KB; hero — до 200–300 KB; обычные изображения — до 100 KB mobile / 200 KB desktop.
- Оптимизировать либо заменить тяжёлый PNG-логотип.
- Подключать только используемые языковые font subset, с `font-display: swap` и минимумом критических начертаний.
- Fingerprint статических ресурсов и выдавать им `Cache-Control: public, max-age=31536000, immutable`.
- Сохранять сжатие Brotli/gzip для HTML, CSS, JS, SVG и JSON; не кэшировать HTML как immutable.
- Lazy-load для внеэкранных изображений/эффектов; preload только реально LCP-ресурса.

### Performance budgets

| Метрика | Цель |
| --- | ---: |
| HTML gzip | ≤ 25 KB |
| CSS на маршрут | ≤ 50 KB gzip |
| JS простой страницы | ≤ 60 KB gzip |
| критические шрифты | ≤ 80 KB |
| главная, первая загрузка | ≤ 1 MB |
| Projects, первая загрузка | ≤ 1.5 MB |
| запросы простой страницы | ≤ 15 |
| запросы Projects | ≤ 25 |
| TTFB p75 | ≤ 600 ms |
| LCP p75 mobile | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| INP | ≤ 200 ms |

Эти пороги проверяются автоматизированным lighthouse/Playwright аудитом как budget; полевые RUM/CrUX данные дополняют, но не заменяют проверку перед релизом.

## 7. SEO, ошибки и индексируемость

- Каждый финальный URL имеет self-canonical с `https://godmodetools.com` и никогда не ссылается на Worker/staging origin.
- Для каждой готовой языковой группы генерируются взаимные `hreflang` и `x-default`; непереведённый `es` не заявляется.
- Локализовать `html lang`, title, description, Open Graph, alt-тексты и CTA.
- Создать реальные `robots.txt` и sitemap, обслуживаемые отдельными маршрутами, с final URL только одного домена.
- Неизвестные пути должны возвращать настоящие `404` с корректным статусом, а не fallback главной с `200`.
- Проверить `Content-Type`, trailing slash policy, robots meta и отсутствие ссылок на технические origins.
- Для `/changelog/` сначала проверить фактическую ценность и трафик: перенести в `/ru/experience/changelog/` только если это публично нужная страница; иначе исключить из sitemap и вернуть `410`.

## 8. Миграция URL и редиректы

Все старые публичные URL получают один прямой permanent redirect (`301`) к своему конечному маршруту. Query string сохраняется, если он не относится к удалённому сервису. Нельзя направлять весь старый домен на одну главную — это ломает внешние ссылки и создаёт soft-404.

GOD-2 фиксирует проверяемый baseline и точные правила миграции в двух companion-артефактах: [site-baseline.md](site-baseline.md) описывает доказательства, текущие дефекты, staging/rollback/public verification, а [url-migration-inventory.json](url-migration-inventory.json) — машиночитаемый контракт маршрутов. Его инварианты выполняет `npm run test:plan`.

| Старый URL | Финальный URL |
| --- | --- |
| `https://godmodetools.com/` | `https://godmodetools.com/ru/` |
| `https://godmodetools.com/en/` | `https://godmodetools.com/en/` (или canonicalize без изменения, если уже финальный) |
| `https://cv.godmodetools.com/` | `https://godmodetools.com/ru/experience/` |
| `https://cv.godmodetools.com/en/` | `https://godmodetools.com/en/experience/` |
| `https://cv.godmodetools.com/java/` | `https://godmodetools.com/ru/experience/java/` |
| `https://cv.godmodetools.com/java/en/` | `https://godmodetools.com/en/experience/java/` |
| `https://cv.godmodetools.com/showcase/` | `https://godmodetools.com/ru/projects/` |
| `https://cv.godmodetools.com/showcase/en/` | `https://godmodetools.com/en/projects/` |
| `https://ai.godmodetools.com/` | `https://godmodetools.com/ru/learning/` |
| `https://ai.godmodetools.com/en/` | `https://godmodetools.com/en/learning/` только после готового английского контента |
| `https://allo.godmodetools.com/` | `https://godmodetools.com/ru/community/` |
| `https://allo.godmodetools.com/en/` | `https://godmodetools.com/en/community/` |
| legacy-файлы резюме | `/{locale}/experience/downloads/...` с точным сохранением типа файла |

Перед изменением Nginx создаётся полный URL inventory: все публичные страницы, скачивания PDF/DOCX/TXT, deep links, внешние ссылки, query strings, `/api/`, `/voidplayer/`, changelog и технические URL. Для каждого адреса фиксируются статус, `Location`, конечный статус и число hops. `www.godmodetools.com` должен одним шагом перенаправлять на `https://godmodetools.com/...`.

## 9. Демонтаж openclaw-voice

Цель — полностью снять сервис с сервера, а не только скрыть ссылку. Старый namespace сохраняется как tombstone `410 Gone`, чтобы поисковики и клиенты не получали главную или неясный `404`.

1. Провести read-only инвентаризацию: кто слушает `3334`, тип runtime (Docker/systemd/process/compose), restart policy, volumes/bind mounts, cron, мониторинг, firewall, потребители и access logs. Секреты идентифицировать по ссылкам, но не выводить их значения.
2. Зафиксировать точные идентификаторы процесса, контейнера, image, unit и файлов. Ничего не удалять по предположению.
3. Отключить автозапуск и остановить сервис, не удаляя артефакты.
4. Проверить, что порт `3334` закрыт, а `/`, `/api/` и `/voidplayer/` продолжают работать; проверить логи на зависимых клиентов и ошибки.
5. Удалить Nginx proxy/upstream и документацию сервиса. Добавить явное правило:

```nginx
location ^~ /openclaw-voice/ {
    return 410;
}
```

6. После согласованного контрольного периода удалить точный runtime: контейнер/unit/process, service-specific image, volumes/файлы, секреты, мониторинг, порт и автозапуск — только если они не используются другими сервисами.
7. Финально подтвердить отсутствие процесса, listener, upstream, auto-start, service-specific secrets и документации; каждый `/openclaw-voice/*` отвечает `410`.

## 10. Порядок выполнения

1. **Baseline и инвентаризация.** Снять скриншоты, тексты, ссылки, SEO-метаданные, размеры загрузок, CV-файлы и полный redirect inventory; зафиксировать staging/production deployment path.
2. **Foundation.** Создать новое Astro-приложение рядом с production, общий locale/route registry, Content Collections, design tokens, BaseLayout, навигацию, SEO-head, 404 и единые компоненты.
3. **Performance foundation.** Подготовить image/font pipeline, cache headers, asset fingerprinting и автоматические performance budgets.
4. **Контентная миграция.** По очереди перенести Hub, Community, Learning (включая реальный EN), Experience и Projects; перенести CV downloads и подготовить будущие `/[locale]/projects/[slug]/`.
5. **SEO и URL-контракты.** Сформировать sitemap/robots/canonical/hreflang, все `301`, `www → apex`, 404 и отдельный 410 для voice.
6. **Демонтаж voice.** Провести процедуру из раздела 9 параллельно только после точной инвентаризации runtime.
7. **Staging.** Развернуть versioned release отдельно от текущего сайта; прогнать функциональные, SEO, redirect, visual и performance проверки.
8. **Production cutover.** Одним атомарным переключением release/symlink активировать build, затем включить постоянные старые subdomain redirects.
9. **Наблюдение и cleanup.** Проверить production URL, логи и Search Console; после контрольного периода удалить старые frontend stacks и deployment paths.

## 11. Build, deployment и rollback

Одна команда сборки должна последовательно: валидировать content schemas, генерировать PDF/DOCX/TXT, собирать Astro, генерировать sitemap/robots, проверять внутренние ссылки и SEO-метаданные, запускать Playwright smoke tests и performance budgets, а затем публиковать один immutable `release/site`.

Nginx раздаёт один Astro dist с apex-vhost. Исключения строго ограничены: `/api/` проксируется к текущему backend, `/voidplayer/` к legacy application, `/openclaw-voice/*` возвращает `410`, а `www`, `ai`, `cv`, `allo` дают точные `301`.

Rollout выполняется через versioned release и атомарное переключение. До cutover старый release сохраняется как rollback-граница. `301` включаются лишь после полного staging acceptance: браузеры и поисковики кэшируют их, поэтому маршрутизацию нельзя тестировать на живых постоянных редиректах. Rollback возвращает предыдущий release и временно отключает новые permanent redirects, если проблема обнаружена до подтверждения индексации.

## 12. Проверки качества

Автоматизировать и запускать на staging перед каждым release:

- build, TypeScript strict, Content Collection schemas и генерацию файлов CV;
- HTTP smoke: 200 для финальных страниц, 301 с одним hop для старых адресов, 404 для неизвестных путей, 410 для voice;
- маршруты RU/EN, отсутствие `es` до перевода, сохранение раздела language switcher;
- все внутренние ссылки, asset URL и загрузки CV;
- self-canonical, `hreflang`, `x-default`, `html lang`, robots, sitemap и отсутствие Worker/staging URLs;
- desktop/mobile Playwright smoke и screenshots ключевых страниц;
- проверку `prefers-reduced-motion`, canvas lifecycle и отсутствие layout shifts;
- performance budgets, cache headers, content types и отсутствие лишней клиентской гидрации;
- регрессионные проверки `/api/` и `/voidplayer/`.

После production cutover проверить тот же набор на публичном домене, плюс логи, redirect chains, DNS/TLS, Search Console и реальные ошибки 4xx/5xx. На production нельзя говорить «готово», пока не проверен публичный URL.

## 13. Cleanup после подтверждённого cutover

После наблюдения и подтверждения, что все маршруты, внешние ссылки и документы работают:

- удалить root Vinext/React starter, Vite/Next-конфиги и неиспользуемые D1/Drizzle starter-файлы;
- удалить старые Hub, кастомный AI builder/Worker, статический Allo-дубль, многосайтовый assembler и отдельный CV Pages workflow, если они больше не используются;
- удалить устаревшие subdomain serving-конфигурации, оставив только redirect hosts;
- удалить runtime `openclaw-voice` по разделу 9;
- обновить документацию, CI и ownership, чтобы новый единый build был единственным поддерживаемым путём.

Удаление выполняется только после подтверждения production и наличия rollback-границы; до этого старые артефакты — не мусор, а страховка.

## 14. Критерии приёмки

- Весь публичный контент обслуживается одним Astro static build на `godmodetools.com`.
- У каждой страницы ровно один финальный locale-first URL: `/ru/...` или `/en/...`; `/es/...` появляется только с готовым переводом.
- Корень перенаправляет на `/ru/`, язык сохраняет текущий раздел, а старые адреса дают ровно один точный `301`.
- Старые поддомены не обслуживают дубликаты страниц; `www` ведёт на apex одним hop.
- `robots.txt`, sitemap, canonical, `hreflang`, Open Graph и `html lang` корректны и не содержат Worker/staging origin.
- Неизвестные адреса дают `404`; весь `/openclaw-voice/*` даёт `410`.
- Сервис OpenClaw Voice, порт, upstream, auto-start, service-specific секреты и мониторинг отсутствуют после контрольного периода.
- `/api/`, `/voidplayer/`, резюме и legacy downloads продолжают работать.
- Общие layout, tokens, UI, locale registry и motion-layer используются всеми публичными разделами.
- Изображения и шрифты проходят единый pipeline, нет необоснованной гидрации, performance budgets проходят автоматически.
- Staging и production проверки пройдены, а после cutover выполнен мониторинг логов и Search Console.

## 15. Jira delivery map

В проекте [GOD](https://alexgoodmanalexgoodman.atlassian.net/jira/software/projects/GOD) создан один общий Epic и девять крупных Stories. Технические подзадачи намеренно не создавались: каждая Story представляет самостоятельный проверяемый результат. GOD-10 добавлен после критической находки независимого review и выделен отдельно, чтобы security remediation имела собственный PR и проверяемый след.

### Epic

- [GOD-1 — Модернизация godmodetools.com: единый быстрый мультиязычный сайт](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-1)

### Stories

| Ключ | Смысловой блок | Результат |
| --- | --- | --- |
| [GOD-2](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-2) | Baseline и миграция URL | Полный inventory, контрольные данные, финальная redirect matrix и rollback contracts |
| [GOD-3](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-3) | Astro foundation | Один Astro/TypeScript build, Content Collections, locale/route registry и единый release contract |
| [GOD-4](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-4) | Design system и motion | Общие tokens/components и безопасная расширяемая анимационная платформа |
| [GOD-5](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-5) | Миграция разделов | Hub, Community, Learning, Experience и Projects под locale-first Astro routes |
| [GOD-6](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-6) | Производительность | Image/font pipeline, caching и автоматические performance budgets |
| [GOD-7](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-7) | SEO и routing | Canonical/hreflang/sitemap/robots, 404 и точные одношаговые redirects |
| [GOD-8](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-8) | Демонтаж OpenClaw Voice | Удалённый runtime/upstream и стабильный `410 Gone` без регрессии `/api/` и `/voidplayer/` |
| [GOD-9](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-9) | Staging, cutover и cleanup | Проверенный публичный release, redirects, мониторинг и удаление прежних стеков |
| [GOD-10](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-10) | Security remediation API | Безопасный API response, ротация PostgreSQL credential и регрессионный тест против утечки secrets |

### Зависимости

- GOD-2 блокирует foundation и демонтаж Voice до завершения инвентаризации.
- GOD-3 блокирует design system, перенос страниц и финальную asset-оптимизацию.
- GOD-4 и GOD-3 блокируют контентную миграцию GOD-5.
- GOD-5 блокирует финальные SEO/routing правила GOD-7.
- GOD-5, GOD-6, GOD-7 и GOD-8 блокируют production cutover GOD-9.
- GOD-10 блокирует production cutover GOD-9 и связан с baseline GOD-2 как найденный во время его review дефект.

Связи записаны в Jira как `Blocks`, а все Stories являются дочерними элементами GOD-1.

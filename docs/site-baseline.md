# GOD-2 — baseline и контракт миграции URL

## Назначение

Этот документ фиксирует исходное состояние перед переносом публичного сайта на единый locale-first origin. Он не меняет runtime и не утверждает, что публичная конфигурация уже исправлена. Машиночитаемый источник правды для маршрутов: [url-migration-inventory.json](url-migration-inventory.json). Его проверяет `npm run test:plan`.

## Метаданные baseline

- Дата публичных HTTP probes: **2026-08-23**.
- Тип доказательств: публичные probes дополняются репозиторной проверкой конфигурации; значения `runtime-dependent` требуют повторной проверки непосредственно перед изменением runtime.
- `app.godmodetools.com`: зарезервирован для будущего самостоятельного приложения, но на дату probe не имеет live DNS/public deployment и не включается в HTTP redirect matrix.
- Во время независимой проверки публичный `/api/` раскрыл `DATABASE_URL` с PostgreSQL credentials. Значение секрета не сохранялось в документах. Аварийное удаление поля из ответа, ротация пароля и проверка нового подключения выполнены; source-controlled защита и регрессия отслеживаются в `GOD-10`.

## Область инвентаризации

- Основной домен и `www`.
- CV: общий профиль, Java-профиль, showcase, changelog и все текущие генерируемые файлы resume.
- Learning (`ai`) и Community (`allo`), включая RU/EN URL.
- Технические контракты `/api/`, `/voidplayer/` и удаляемый `/openclaw-voice/`.
- `robots.txt`, sitemap и неизвестные URL как обязательные HTTP-контракты.

## Доказательства текущего состояния

Пятнадцать актуальных viewport-снимков пяти публичных разделов лежат в [`docs/baseline-screenshots/`](baseline-screenshots/README.md): mobile, tablet и desktop для Home, Experience, Projects, Learning и Community. Они сняты с production 2026-08-23 в reduced-motion режиме и фиксируют исходное состояние до миграции.

| Наблюдение | Репозиторное доказательство | Значение для миграции |
| --- | --- | --- |
| Пять host обслуживаются отдельными Nginx server blocks | `infra/nginx/default.conf` | Нужна точная matrix, а не redirect всего subdomain на главную |
| Общий `try_files … /index.html` есть на apex, AI, CV и Allo | `infra/nginx/default.conf` | Неизвестные URL и отсутствующие robots/sitemap могут становиться soft-404 с `200` |
| `/api/*` проксируется к backend, `/voidplayer/*` раздаётся отдельно | `infra/nginx/default.conf`; public probes `/api/health` и `/voidplayer/void.webmanifest` | Prefix, deep path и query semantics сохраняются; они не должны попасть в frontend redirect |
| `/openclaw-voice/` всё ещё proxy_pass на `172.18.0.1:3334` | `infra/nginx/default.conf` | До демонтажа нужен read-only runtime audit; после него весь namespace обязан отвечать `410` |
| AI builder выставляет Worker origin в canonical, robots и sitemap | `sites/ai/website/scripts/build.mjs`, `sites/ai/website/src/index.html` | Ни canonical, ни финальные target не могут ссылаться на Worker/staging origin |
| CV строит profile/language routes и генерирует 12 resume файлов | `sites/cv/src/pages/[...slug].astro`, `sites/cv/public/downloads/` | Нужны точные redirect для каждого формата и профиля |
| Старое меню использует subdomain URLs | `shared/ecosystem-nav.json` | Все внутренние ссылки должны перейти на final locale-first URLs |

Репозиторные доказательства не заменяют внешний HTTP baseline. Перед изменением edge/Nginx следует выполнить запросы на production с фиксацией timestamp, конечного status, `Location` и числа redirect hops для каждой записи inventory. `Content-Type`, canonical и body classification обязательны для HTML, SEO, API и репрезентативных asset-контрактов, где эти свойства определяют корректность ответа.

## Текущие дефекты и финальные действия

| Контракт | Ожидаемая проблема в текущем runtime | Финальное действие | Целевой status |
| --- | --- | --- | ---: |
| apex unknown path | Public probe: `200 text/html`, hub index fallback | Отдельная 404-страница и `try_files … =404` после locale routes | 404 |
| AI/CV/Allo unknown path | Public probe: `200 text/html`, соответствующий index fallback | Старые hosts только точечно redirect, остальные unknown paths — 404 | 404 |
| apex `robots.txt`, `sitemap.xml` | Public probe: `200 text/html`, hub index вместо технического файла | Сгенерировать реальные robots/sitemap с корректным Content-Type | 200 |
| `www` | дубликат apex может отвечать `200` | Один `301` на `https://godmodetools.com` с тем же path/query | 301 |
| AI canonical/OG/robots/sitemap | Worker origin вместо публичного домена | Генерировать только от `https://godmodetools.com/{locale}/learning/` | 200 |
| AI `/en/` | может показывать русский контент | Redirect на EN только после реального перевода; до этого временный явный noindex/404 планируется отдельно | 301 после EN |
| CV changelog | `https://cv.godmodetools.com/changelog/` сейчас получает `200` от SPA fallback и canonical указывает на CV root; это не отдельная корректно обслуженная страница | Перенести как настоящий `/ru/experience/changelog/`; inventory фиксирует один redirect на этот URL | 301 |
| `/openclaw-voice/*` | proxy к legacy voice runtime | Остановить и удалить runtime по утверждённой процедуре, заменить proxy на tombstone | 410 |
| `/api/` | До аварийной меры публичный JSON включал `DATABASE_URL`; credential уже ротирован | Оставить только безопасный status/message contract и регрессионный security-тест в `GOD-10` | 200 |

## Политика query string и URL

1. Для `redirect` сохранять исходную query string без изменения. Пример: `https://cv.godmodetools.com/showcase/?utm_source=x` → `https://godmodetools.com/ru/projects/?utm_source=x`.
2. Фрагмент (`#…`) в HTTP-запрос не передаётся и не может быть обработан сервером; браузер сохраняет его при обычном redirect.
3. Для `serve` `/api/` и `/voidplayer/` query string и path передаются существующему контракту без URL-normalization.
4. Для `gone` `/openclaw-voice/*` query string не переадресуется: сервер возвращает `410 Gone` на тот же запрос.
5. Финальные public HTML URLs используют trailing slash. Точное Nginx/Astro правило должно устранять альтернативу без slash максимум одним hop.
6. Для известных HTTP URL нельзя сначала переходить на HTTPS старого host, а затем на новый URL. `http_policy` требует один прямой `301` на окончательный HTTPS target. Для HTTP-вариантов `gone` и `not_found` сервер сразу возвращает `410` или `404` без redirect.
7. Prefix contracts `/api/*` и `/voidplayer/*` сохраняют path и query. `/openclaw-voice/*` целиком завершается `410` и не имеет upstream.

## Локали

`ru` и `en` — публикуемые локали. `ru` является default и `/` перенаправляется на `/ru/`. `es` — зарегистрированная будущая locale, но не выпускается, не добавляется в sitemap/nav/hreflang до готового перевода. Любая future locale использует тот же первый сегмент URL: `/{locale}/{section}/`.

## Staging, rollout и rollback

1. Собрать новый versioned release отдельно от production и загрузить его на закрытый staging host/origin.
2. Выполнить `npm run test:plan`, HTTP smoke по inventory, internal-link check, canonical/hreflang/robots/sitemap assertions, CV downloads и визуальные mobile/desktop checks.
3. На staging подтвердить каждый redirect одним hop, status для unknown/voice, сохранение query и отсутствие Worker/stage origin в canonical/OG/sitemap.
4. Сохранить текущий release и Nginx configuration как rollback boundary. Не включать permanent redirects на production до staging acceptance.
5. Атомарно переключить versioned release; затем активировать точные `301` на legacy hosts. При ошибке до подтверждения индексации вернуть предыдущий release и отключить новые `301` только по утверждённой rollback процедуре.

## Public verification после cutover

- Проверить production TLS/DNS и все финальные `/ru/`/`/en/` URLs.
- Проверить каждую entry inventory: status, `Location`, ровно один hop, target, query policy и headers.
- Проверить `/api/` и `/voidplayer/` функциональным smoke; `/openclaw-voice/*` — `410` без upstream.
- Проверить реальные 404, `robots.txt`, sitemap, canonical, hreflang, `html lang`, Open Graph и отсутствие Worker/stage origin.
- Проверить PDF/DOCX/TXT downloads и browser/mobile journeys.
- Наблюдать access/error logs, Search Console, 4xx/5xx и redirect chains в согласованный контрольный период до cleanup.

## Условия закрытия GOD-2

- Inventory покрывает все известные public/legacy/service contracts, формально описывает HTTP и prefix semantics и имеет один окончательный action на source URL.
- В репозитории сохранены свежие production screenshots ключевых страниц на трёх viewport.
- Inventory проходит `npm run test:plan`.
- Приняты политика query string, locale-first target и fate changelog/downloads.
- Production HTTP baseline и runtime audit OpenClaw Voice зафиксированы отдельно перед исполнением edge/service changes.
- Никаких Nginx, DNS, service или production изменений в рамках GOD-2 не производится.

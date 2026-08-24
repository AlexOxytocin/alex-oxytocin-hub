# Frozen legacy visual reference

## Текущий release

- Source: `/opt/app/frontend/sites/releases/20260819-211500-hub-coat-original-v6`
- Reference id: `20260819-211500-hub-coat-original-v6-reference-v1`
- Public prefix: `https://godmodetools.com/__legacy-reference/20260819-211500-hub-coat-original-v6-reference-v1/`
- Production pointer `sites/current` не переключается.
- DNS, сертификаты, порты и отдельные containers не добавляются. Reference использует существующий apex HTTPS/443.

Страницы: `/home/`, `/experience/`, `/projects/`, `/learning/`, `/community/`.

Snapshot — обычная копия текущих `hub`, `cv`, `ai`, `allo`. В public-копии внутренние URL переписаны под immutable prefix, canonical и `og:url` удалены, во все HTML добавлен `noindex,nofollow`, а Nginx добавляет `X-Robots-Tag`, HSTS и `Cache-Control: no-store`. Отдельный `robots.txt` содержит `Disallow: /`.

## Preflight и deploy

Host tool не меняет live config в режиме `preflight`:

```bash
node /tmp/legacy-reference-host-20260819-211500-hub-coat-original-v6-reference-v1.mjs \
  preflight \
  --release-id 20260819-211500-hub-coat-original-v6-reference-v1 \
  --source-release-id 20260819-211500-hub-coat-original-v6
```

Apply создаёт snapshot, повторяет `nginx -t`, сохраняет exact backup, атомарно заменяет только `default.conf`, снова запускает `nginx -t`, reload и пять direct-origin probes:

```bash
node /tmp/legacy-reference-host-20260819-211500-hub-coat-original-v6-reference-v1.mjs \
  deploy --apply \
  --release-id 20260819-211500-hub-coat-original-v6-reference-v1 \
  --source-release-id 20260819-211500-hub-coat-original-v6 \
  --confirm DEPLOY-20260819-211500-hub-coat-original-v6-reference-v1
```

Exact backup: `/opt/app/frontend/legacy-reference/backups/20260819-211500-hub-coat-original-v6-reference-v1/default.conf.before`.

## Verification

Скачать `release-manifest.json` с host и выполнить public и direct-origin пути:

```bash
npm run verify:legacy-reference -- \
  --origin https://godmodetools.com \
  --release-id 20260819-211500-hub-coat-original-v6-reference-v1 \
  --release-manifest /path/to/release-manifest.json

npm run verify:legacy-reference -- \
  --origin https://godmodetools.com \
  --release-id 20260819-211500-hub-coat-original-v6-reference-v1 \
  --release-manifest /path/to/release-manifest.json \
  --connect-address 89.167.49.137
```

Verifier запрашивает все файлы из manifest, пять route URL, crawl-safe 404 и robots; проверяет TLS, HTTPS headers, отсутствие canonical/`og:url` и то, что plain HTTP только перенаправляет на HTTPS.

## Однокомандный rollback

Rollback восстанавливает exact `default.conf` backup, выполняет `nginx -t`, reload и удаляет только reference snapshot. Основной release и `sites/current` не затрагиваются.

```bash
node /tmp/legacy-reference-host-20260819-211500-hub-coat-original-v6-reference-v1.mjs \
  rollback --apply \
  --release-id 20260819-211500-hub-coat-original-v6-reference-v1 \
  --confirm ROLLBACK-20260819-211500-hub-coat-original-v6-reference-v1
```

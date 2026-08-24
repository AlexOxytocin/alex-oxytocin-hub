# GOD-9 — staging, production cutover и cleanup

## Статус и граница полномочий

- Story: [GOD-9](https://alexgoodmanalexgoodman.atlassian.net/browse/GOD-9)
- Текущая фаза: **toolchain/repository preparation only**
- Production deploy, Nginx reload, cutover и server cleanup в этой фазе **не выполнялись**.
- Следующий шаг разрешён только отдельным сообщением после review и merge PR.

Этот runbook управляет только единым frontend release, `site-current`,
`/opt/app/nginx/conf.d/default.conf` и
`/opt/app/nginx/conf.d/_includes/*.inc`. Он не даёт разрешения изменять
backend, PostgreSQL, community applications, Flatscanner, Docker networks,
`/opt/app/frontend/voidplayer` или любые другие пути под `/opt/app`.

## 1. Подтверждённый production baseline

Read-only preflight 2026-08-24 подтвердил:

| Contract | Evidence |
| --- | --- |
| Текущий frontend | `/opt/app/frontend/sites/current -> /opt/app/frontend/sites/releases/20260819-211500-hub-coat-original-v6` |
| Старые releases | 114 real directories, `1,179,756 KiB` |
| VoidPlayer | отдельный `/opt/app/frontend/voidplayer`, `426,232 KiB`; protected, не cleanup target |
| Nginx bind mounts | host `nginx.conf`, `conf.d`, `frontend`, SSL и certbot mounted read-only в container |
| Effective include | только `/etc/nginx/conf.d/*.conf`; `/etc/nginx/includes` отсутствует |
| Соседний vhost | `flatscanner.godmodetools.com.conf` — отдельный protected file |
| Сети | Nginx и backend имеют один общий Docker network; staging определяет его через inspect, не меняет его |
| TLS | certificate SAN покрывает apex, `www`, `ai`, `cv`, `allo`, Flatscanner |
| Nginx syntax | `docker exec nginx nginx -t` — PASS |

Полный production config и server dumps не копировались в репозиторий или
evidence. Перед любым будущим apply нужно заново выполнить read-only preflight:

```bash
node ops/god9-host.mjs preflight
```

Если hash `default.conf`, mounts, protected paths, legacy symlink или shared
backend network изменились, change window останавливается и PR/runbook
пересматриваются.

## 2. Почему Astro build можно отделить от legacy repo stacks

До repository cleanup выполнены clean install и полный root build:

```text
npm ci                         PASS, 0 vulnerabilities
npm run build                  PASS, Astro check 0 errors/warnings/hints
dist                           378 files / 43 HTML / 27,858,129 bytes
forbidden runtime references   0
```

`scripts/prepare-god9-release.mjs --apply` сам удаляет прежний `dist`, запускает
`npm run build` из текущего commit и только после этого проверяет обязательные
RU/EN страницы, `404.html`, robots, sitemap, 12 resume downloads, отсутствие
root `index.html`, symlink-ов, technical origins и legacy runtime paths. До и
после build разрешены только exact unstaged/untracked generated resume outputs;
любые staged или другие dirty source paths закрывают gate. Package wrapper не
является security boundary. Release собирается только из свежего `dist`, target
Nginx files и двух dependency-free ops scripts. Поэтому удалённые Vinext/React,
D1/Drizzle, Worker, старые Hub/AI/CV/Allo builders и multi-site assembler не
входят ни в build graph, ни в artifact.

## 3. Immutable release artifact

Сначала запускается весь suite. Создание artifact — отдельный explicit apply и
возможно только из clean Git worktree:

```bash
npm ci
npm test
npm run audit
npm run test:http:nginx

GOD9_RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short=12 HEAD)"
npm run release:plan -- --release-id "$GOD9_RELEASE_ID"
npm run release:prepare -- --release-id "$GOD9_RELEASE_ID" --confirm "$GOD9_RELEASE_ID"
```

Получается ignored local directory:

```text
release/<release-id>/
├── site/
├── nginx/default.conf
├── nginx/_includes/{security-headers,site-cache}.inc
├── ops/{god9-host,god9-cleanup}.mjs
├── release-manifest.json
└── SHA256SUMS
```

Transport permissions считаются недоверенными: Windows `scp -r`, OpenSSH/SFTP
и POSIX clients могут создать разные mode bits. Upload всегда идёт в новый
temporary direct child releases root, никогда в final release, `sites/current`
или `site-current`. Пример ниже одинаково применим к `scp` и Windows `scp.exe`;
на Windows меняется только синтаксис локальных переменных, remote paths и
последовательность остаются exact:

```bash
GOD9_HOST="root@89.167.49.137"
GOD9_RELEASES_ROOT="/opt/app/frontend/sites/releases"
GOD9_UPLOAD_NAME=".upload-$GOD9_RELEASE_ID-transfer-01"
GOD9_UPLOAD_PATH="$GOD9_RELEASES_ROOT/$GOD9_UPLOAD_NAME"
GOD9_FINAL_PATH="$GOD9_RELEASES_ROOT/$GOD9_RELEASE_ID"

# Оба пути обязаны отсутствовать. Broken symlink тоже считается занятым path.
ssh "$GOD9_HOST" bash -s -- "$GOD9_UPLOAD_PATH" "$GOD9_FINAL_PATH" <<'REMOTE'
set -eu
upload=$1
final=$2
test ! -e "$upload" && test ! -L "$upload"
test ! -e "$final" && test ! -L "$final"
REMOTE

# Destination отсутствует: scp создаёт ровно temporary directory.
scp -r "release/$GOD9_RELEASE_ID" "$GOD9_HOST:$GOD9_UPLOAD_PATH"

ssh "$GOD9_HOST" bash -s -- \
  "$GOD9_UPLOAD_PATH" "$GOD9_FINAL_PATH" "$GOD9_UPLOAD_NAME" "$GOD9_RELEASE_ID" <<'REMOTE'
set -eu
upload=$1
final=$2
upload_name=$3
release_id=$4
test -f "$upload/release-manifest.json"
test ! -e "$final" && test ! -L "$final"

cd "$upload"
node ops/god9-host.mjs finalize-upload \
  --apply \
  --release-id "$release_id" \
  --confirm "$release_id" \
  --upload-name "$upload_name"

# Только finalized path проходит повторный host/candidate preflight.
cd "$final"
node ops/god9-host.mjs preflight --release-id "$release_id"
REMOTE
```

`finalize-upload` сначала проверяет manifest/SHA256SUMS и весь payload во
временном path, затем выставляет exact `0755` всем directories и `0644` всем
regular files. После этого он повторяет checksum/size validation, проверяет
каждый directory (`x`) и file (`r`) через `docker exec --user nginx` на том же
read-only frontend mount и только затем атомарно переименовывает temp в final.
Final path повторно проверяется `preflight --release-id` и теми же gates внутри
`staging-up`, `prepare-cutover` и `cutover`.

Не запускать `chmod` после finalization, не повторять upload в существующий
temp/final path и не исправлять failed release на месте. Любой failure оставляет
неактивный exact path как evidence; дальнейшая очистка или новый upload требуют
отдельного имени и отдельного решения. `god9-host.mjs` по-прежнему откажется от
symlink directory, unmanifested files, checksum mismatch или path traversal.
Изменение payload вместе с `SHA256SUMS` при неизменном manifest не пройдёт.

## 4. Isolated staging gate

Только после отдельного разрешения оркестратора:

```bash
cd "/opt/app/frontend/sites/releases/$GOD9_RELEASE_ID"
node ops/god9-host.mjs staging-up \
  --apply \
  --release-id "$GOD9_RELEASE_ID" \
  --confirm "$GOD9_RELEASE_ID" \
  --port 8443 \
  --http-port 8080
```

Staging container:

- публикует TLS только на `127.0.0.1:8443`, а plain HTTP — на отдельном
  `127.0.0.1:8080`;
- монтирует candidate `site`, Nginx config, production certificate и реальный
  VoidPlayer read-only;
- подключается к уже существующей общей сети backend, не создавая и не меняя
  network;
- запускается read-only с `no-new-privileges`;
- содержит permanent redirects только внутри изолированного стенда. Они ещё не
  опубликованы production Nginx.

С operator machine открыть SSH tunnel и прогнать полный browser/performance/
HTTP suite. `--insecure` относится только к loopback hostname mismatch; cert
и SNI production отдельно проверяются после cutover.

```bash
ssh -N \
  -L 18443:127.0.0.1:8443 \
  -L 18080:127.0.0.1:8080 \
  root@89.167.49.137

npm run verify:god9 -- \
  --phase staging \
  --release-id "$GOD9_RELEASE_ID" \
  --connect-address 127.0.0.1 \
  --connect-port 18443 \
  --connect-http-port 18080 \
  --browser-origin https://127.0.0.1:18443 \
  --release-manifest "release/$GOD9_RELEASE_ID/release-manifest.json" \
  --browser \
  --signed-local-performance \
  --insecure \
  --output "god9-$GOD9_RELEASE_ID-staging.json"
```

Verifier независимо проверяет HTTPS inventory и plain HTTP policy. Для каждой
HTTP-записи `redirect`/`serve` обязаны одним `301` вести сразу на её HTTPS
`final.target` с сохранённым query; `gone` возвращает `410`, `not_found` — `404`,
оба без `Location`. Evidence отдельно хранит `http.httpsInventory.checks` и
`http.httpPolicy.checks`, one-hop/terminal counts и разные connect ports.
Дополнительно проверяются RU/EN, downloads, API/VoidPlayer,
canonical/hreflang, responsive/browser contracts и performance budgets. Любой
failure блокирует дальнейшие шаги. Design/content/HTTP проверки идут через
реальный staging Nginx. Performance verifier запускается на ephemeral loopback
server, который отдаёт только файлы из подписанного release manifest и перед
каждым ответом повторно сверяет SHA-256. Так SSH channel setup не попадает в LCP,
но измеряется ровно candidate bundle; после cutover тот же performance suite
обязательно повторяется через public DNS/CDN и при failure требует rollback.

После evidence стенд удаляется отдельной exact-командой:

```bash
node ops/god9-host.mjs staging-down \
  --apply --release-id "$GOD9_RELEASE_ID" --confirm "$GOD9_RELEASE_ID"
```

## 5. Rollback packet и заранее проверенный rollback

Staging evidence копируется на server во временный exact path. Hash Nginx берётся
из свежего `preflight`, а не из этого документа:

```bash
node ops/god9-host.mjs prepare-cutover \
  --apply \
  --release-id "$GOD9_RELEASE_ID" \
  --confirm "$GOD9_RELEASE_ID" \
  --expected-nginx-sha "$GOD9_NGINX_SHA" \
  --staging-evidence "/tmp/god9-$GOD9_RELEASE_ID-staging.json"

node ops/god9-host.mjs test-rollback \
  --apply --release-id "$GOD9_RELEASE_ID" --confirm "$GOD9_RELEASE_ID"
```

Rollback packet под `/opt/app/frontend/god9-state/<release-id>` сохраняет exact
previous config hash/content, previous `site-current`, legacy target, previous
`_includes` и accepted staging evidence. `test-rollback` сначала создаёт
transient read-only Nginx container, подключает его ко всем Docker networks
production Nginx и только затем запускает прежний config. Это сохраняет DNS
доступность всех legacy upstreams, а marker создаётся лишь после успешных
`nginx -t` и HTTP probes. Cutover без marker невозможен.

## 6. Atomic production cutover и immediate rollback

```bash
node ops/god9-host.mjs cutover \
  --apply --release-id "$GOD9_RELEASE_ID" --confirm "$GOD9_RELEASE_ID"
```

Порядок первой миграции:

1. Непосредственно перед первой mutation повторяется полный read-only preflight:
   mounts, shared backend network, Flatscanner ownership и `nginx -t`.
2. Ещё не используемый production config symlink атомарно получает target
   `sites/releases/<id>/site`.
3. Два exact `.inc` (`security-headers` и `site-cache`) устанавливаются во
   вложенный `_includes`; gzip остаётся единолично в host `nginx.conf`.
4. `default.conf` атомарно заменяется config с root
   `/usr/share/nginx/html/site-current`.
5. Выполняются `nginx -t` и reload. При любой ошибке script восстанавливает
   packet и повторно валидирует/reloads прежний config.
6. `sites/current` остаётся без изменений на весь observation window.

Отдельный Flatscanner config, `/api/`, `/voidplayer/`, backend containers,
networks и всё вне allowlist не изменяются.

Immediate rollback до закрытия observation gate:

```bash
node ops/god9-host.mjs rollback \
  --apply --release-id "$GOD9_RELEASE_ID" --confirm "$GOD9_RELEASE_ID"
```

Эта команда допустима только пока legacy-link retirement ещё не начался.
`legacy-link-retired.json` закрывает rollback **до** unlink `sites/current`;
после появления marker rollback, rollback rehearsal и повторный cutover падают
до первой mutation. Packet после этого остаётся только historical evidence:
прежний config зависит от legacy link/target, которые cleanup уже может удалить.
Восстановление после retirement требует нового отдельно проверенного
forward-recovery плана, а не запуска старой rollback-команды.

## 7. Post-cutover public и direct-origin verification

Сразу после cutover прогнать оба независимых пути:

```bash
npm run verify:god9 -- \
  --phase production \
  --release-id "$GOD9_RELEASE_ID" \
  --release-manifest "release/$GOD9_RELEASE_ID/release-manifest.json" \
  --browser \
  --output "god9-$GOD9_RELEASE_ID-public.json"

npm run verify:god9 -- \
  --phase production \
  --release-id "$GOD9_RELEASE_ID" \
  --connect-address 89.167.49.137 \
  --connect-port 443 \
  --connect-http-port 80 \
  --release-manifest "release/$GOD9_RELEASE_ID/release-manifest.json" \
  --output "god9-$GOD9_RELEASE_ID-direct-origin.json"
```

Public pass подтверждает Cloudflare/DNS path; pinned-origin pass обходит
Cloudflare, сохраняя исходные Host/SNI для каждого inventory URL. Дополнительно
проверяются Nginx access/error logs, 4xx/5xx и dependency traffic в течение
согласованного observation window. Search Console проверяется при доступе. Если
он недоступен, blocker явно фиксируется, а обязательными fallback становятся
public sitemap, robots и logs — недоступность нельзя записывать как pass.

## 8. Cleanup только после observation

Observation evidence имеет schema `god9.observation.v1` и должно содержать:

```json
{
  "schema": "god9.observation.v1",
  "releaseId": "<release-id>",
  "result": "pass",
  "startedAtUtc": "<ISO-8601>",
  "endedAtUtc": "<ISO-8601>",
  "approvedWindowHours": 24,
  "public": { "result": "pass", "evidenceSha256": "<64-hex>" },
  "directOrigin": { "result": "pass", "evidenceSha256": "<64-hex>" },
  "logs": { "result": "pass" },
  "searchConsole": "blocked",
  "fallbacks": { "sitemap": "pass", "robots": "pass", "logs": "pass" }
}
```

Сначала план. `inventory` перечисляет только direct real children releases root,
автоматически защищает active и legacy targets и требует ещё один явный
`--keep-release-id`. Он fail-closed, если `--release-id` не совпадает с release,
на который реально указывает `site-current`. Output сохраняется как immutable
reviewed manifest:

```bash
node ops/god9-cleanup.mjs inventory \
  --release-id "$GOD9_RELEASE_ID" \
  --keep-release-id "<explicit-rollback-release>" \
  > "/tmp/god9-$GOD9_RELEASE_ID-cleanup-pre-retirement.json"

node ops/god9-cleanup.mjs plan \
  --manifest "/tmp/god9-$GOD9_RELEASE_ID-cleanup-pre-retirement.json"
```

Plan возвращает exact target list, count, reclaimable KiB и manifest SHA-256.
Каждый target повторно проверяется как contained real directory без mountpoints;
active/legacy/kept releases и VoidPlayer не могут попасть в список. Никакие
globs или broad `/opt/app` deletes не используются.

После отдельного approval можно окончательно закрыть rollback, вывести legacy
pointer из эксплуатации (target остаётся только в historical packet/evidence),
переснять manifest и применить ровно его. Pre-retirement manifest выше после
retirement применять запрещено: он защищал legacy target и уже устарел.
Retirement сначала создаёт durable fail-closed marker и только затем удаляет
link; с этого момента старая rollback команда намеренно недоступна:

```bash
node ops/god9-cleanup.mjs retire-legacy-link \
  --apply \
  --release-id "$GOD9_RELEASE_ID" \
  --confirm "RETIRE-$GOD9_RELEASE_ID" \
  --observation-evidence "/tmp/god9-$GOD9_RELEASE_ID-observation.json" \
  --public-evidence "/tmp/god9-$GOD9_RELEASE_ID-public.json" \
  --direct-origin-evidence "/tmp/god9-$GOD9_RELEASE_ID-direct-origin.json"

POST_RETIRE_MANIFEST="/tmp/god9-$GOD9_RELEASE_ID-cleanup-post-retirement.json"

# noclobber не позволяет незаметно заменить уже reviewed manifest.
( set -o noclobber
  node ops/god9-cleanup.mjs inventory \
    --release-id "$GOD9_RELEASE_ID" \
    --keep-release-id "<explicit-forward-recovery-release>" \
    > "$POST_RETIRE_MANIFEST"
)

node ops/god9-cleanup.mjs plan \
  --manifest "$POST_RETIRE_MANIFEST"

POST_RETIRE_SHA256="$(sha256sum -- "$POST_RETIRE_MANIFEST" | cut -d ' ' -f 1)"

node ops/god9-cleanup.mjs apply \
  --apply \
  --manifest "$POST_RETIRE_MANIFEST" \
  --confirm "$POST_RETIRE_SHA256" \
  --observation-evidence "/tmp/god9-$GOD9_RELEASE_ID-observation.json" \
  --public-evidence "/tmp/god9-$GOD9_RELEASE_ID-public.json" \
  --direct-origin-evidence "/tmp/god9-$GOD9_RELEASE_ID-direct-origin.json"
```

Если manifest, protected pointers, mount table или evidence изменились после
plan, apply останавливается. Cleanup не включает Nginx backups, Docker resources,
VoidPlayer, backend, PostgreSQL, community apps или Flatscanner.

## 9. Completion gate

GOD-9 и Epic нельзя считать выполненными, пока одновременно не сохранены:

- staging full-suite evidence до публикации redirects;
- rollback-test marker;
- successful cutover marker;
- Cloudflare public и pinned direct-origin evidence;
- RU/EN, downloads, 404/410, canonical/hreflang и performance results;
- observation/log/Search Console либо честный external blocker + fallbacks;
- reviewed cleanup manifest и post-cleanup verification;
- подтверждение, что `/api/`, `/voidplayer/` и Flatscanner не изменились.

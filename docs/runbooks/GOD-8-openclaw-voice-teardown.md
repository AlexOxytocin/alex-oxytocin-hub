# GOD-8: безопасный демонтаж OpenClaw Voice

- Версия: 1.1
- Инвентаризация: 2026-08-24 04:32–04:39 UTC
- Состояние: **POST-GATE-2 CHECKPOINT — reversible teardown применён и проверен; Gate 3 запрещён**

Этот runbook выводит из эксплуатации только voice-call surface. Он не удаляет shared OpenClaw gateway, Telegram channel, Minimax plugin, `/api/`, `/voidplayer/` или другие сервисы на хосте.

Машиночитаемый HTTP/host contract: [`docs/contracts/openclaw-voice-teardown.v1.json`](../contracts/openclaw-voice-teardown.v1.json).

## 1. Вывод discovery

Главная граница здесь не косметическая: порт `3334` принадлежит не отдельному контейнеру, а bundled plugin `voice-call` внутри общего `openclaw-gateway.service`. Тот же gateway обслуживает включённый Telegram channel и Minimax plugin. Поэтому остановка/disable unit или удаление глобального npm package сломает соседний runtime.

| Surface | Проверенный факт |
| --- | --- |
| Host | `root@89.167.49.137`, Ubuntu 24.04.4 LTS, arm64 |
| Listener | `0.0.0.0:3334`, snapshot PID `558590` (`openclaw-gateway`, Node); прямое TCP-соединение из интернета успешно |
| Unit | `/etc/systemd/system/openclaw-gateway.service`; active, enabled, `Restart=always`, `RestartSec=5`, main PID snapshot `558582` |
| Unit command | `/usr/bin/openclaw gateway run --verbose`; `WorkingDirectory=/root/.openclaw`; output в `/root/openclaw-gateway.log` |
| Runtime | Node `v22.22.1`; global `openclaw@2026.4.2` (`d74a122`), bundled voice plugin source `/usr/lib/node_modules/openclaw/dist/extensions/voice-call/index.js` |
| Containers/images/volumes | Voice runtime не имеет Docker/Podman container, image, named volume или bind mount. Nginx — отдельный shared container `nginx:alpine` |
| Shared config | `/root/.openclaw/openclaw.json`, mode `0600`; `channels.telegram.enabled=true`, `plugins.entries.minimax.enabled=true`, `plugins.entries.voice-call.enabled=true` |
| Voice config | `plugins.entries.voice-call`; provider `twilio`; `serve.bind=0.0.0.0`; `serve.port=3334`; webhook `/openclaw-voice/webhook`; stream `/openclaw-voice/stream`; TTS `openai` |
| Secret references | Значения не выводились и не записывались. Voice subtree содержит Twilio auth token и два OpenAI API-key fields. `EnvironmentFiles` у unit отсутствуют; secrets лежат в JSON и четырёх старых JSON backups |
| Voice data | `/root/.openclaw/voice-calls/calls.jsonl`, один файл, 468548 bytes, 496 records; последнее завершение `2026-04-11T03:03:21.058Z` |
| Extra plugin copy | `/root/.openclaw/workspace/plugins/voice-call-local`, семь файлов; в `plugins.installs` отсутствует, loaded source — bundled plugin, не эта копия |
| Nginx | container `nginx`, compose `/opt/app/docker-compose.yml`, current bind `/opt/app/nginx/conf.d/default.conf`; proxy `/openclaw-voice/` → `http://172.18.0.1:3334` |
| Firewall | UFW active; `3334/tcp` открыт `Anywhere` для IPv4 и IPv6; default incoming policy deny |
| DNS | Apex и `www` проксируются Cloudflare; отдельные `openclaw-voice.godmodetools.com` и `voice.godmodetools.com` не существуют |
| Consumers | Config объявляет внешний Twilio webhook/public URL. Docker env consumers и текущие established connections на 3334 не найдены |
| Access evidence | Текущий nginx container log содержит только 16 запросов к namespace, все от `2026-08-24`: 15×404, 1×301, включая inventory probes. Container недавно пересоздан, поэтому это не доказывает отсутствие исторических consumers |
| Monitoring/cron | Service-specific timer/monitor/logrotate rule не найден. Root crontab содержит `/opt/openclaw/backup.sh`, но файл отсутствует; cron относится ко всему OpenClaw и не удаляется в GOD-8 |

Discovery hashes для drift gate:

```text
12f758d4718dc1b8468edb2283bc95f9a220f37aaff76951bf83cfe573606092  /etc/systemd/system/openclaw-gateway.service
f87c7cb2014b5b95f24d4d3458cca9582a03bf5e3e1962014d217b9798bcecba  /root/.openclaw/openclaw.json
caca200600fbb7b9846a619eec97291abb8918b8481f20fe62962d5e988b20f6  /opt/app/nginx/conf.d/default.conf
77e5b2f586902a6135cc8f63505195def17191b31cadd604f8407ff8581ec0fa  /usr/lib/node_modules/openclaw/openclaw.mjs
```

PIDs не являются teardown targets: после restart они изменятся. Targets задаются unit, config subtree, exact paths, Nginx block и firewall rule.

## 2. Неприкосновенные shared targets

Следующие действия запрещены в GOD-8:

- отключать или удалять `openclaw-gateway.service`;
- удалять global `openclaw@2026.4.2`, весь `/usr/lib/node_modules/openclaw` или весь `/root/.openclaw`;
- удалять `/root/openclaw-gateway.log` или общий root cron как “voice-only”;
- копировать репозиторный `infra/nginx/default.conf` поверх production-файла: production содержит дополнительные актуальные routes;
- менять Docker containers/networks/volumes, кроме read-only проверки shared `nginx`;
- менять blocks `/api/` и `/voidplayer/`;
- использовать glob или рекурсивное принудительное удаление.

Ожидаемое финальное состояние shared runtime: `openclaw-gateway.service` остаётся active+enabled, Telegram/Minimax остаются loaded, а только `voice-call` становится disabled и перестаёт слушать `3334`.

Для acceptance criterion «auto-start отключён» source of truth здесь — `plugins.entries.voice-call.enabled=false`: отдельного voice unit/container/restart policy не существует. Отключение shared unit недопустимо без отдельной Story на полный OpenClaw retirement.

## 3. Gate 0 — повторить read-only drift check

Выполнять непосредственно перед backup. Любое несовпадение hash останавливает процедуру и требует нового review.

```bash
set -eu
test "$(sha256sum /etc/systemd/system/openclaw-gateway.service | cut -d' ' -f1)" = "12f758d4718dc1b8468edb2283bc95f9a220f37aaff76951bf83cfe573606092"
test "$(sha256sum /root/.openclaw/openclaw.json | cut -d' ' -f1)" = "f87c7cb2014b5b95f24d4d3458cca9582a03bf5e3e1962014d217b9798bcecba"
test "$(sha256sum /opt/app/nginx/conf.d/default.conf | cut -d' ' -f1)" = "caca200600fbb7b9846a619eec97291abb8918b8481f20fe62962d5e988b20f6"
test "$(sha256sum /usr/lib/node_modules/openclaw/openclaw.mjs | cut -d' ' -f1)" = "77e5b2f586902a6135cc8f63505195def17191b31cadd604f8407ff8581ec0fa"
test "$(systemctl is-active openclaw-gateway.service)" = "active"
test "$(systemctl is-enabled openclaw-gateway.service)" = "enabled"
test "$(openclaw config get plugins.entries.voice-call.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "true"
test "$(openclaw config get channels.telegram.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "true"
test "$(openclaw config get plugins.entries.minimax.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "true"
docker exec nginx nginx -t
ss -H -ltn '( sport = :3334 )'
ufw status numbered | grep '3334/tcp'
```

## 4. Gate 1 — создать rollback packet

Это первая разрешаемая запись на production после независимого review. Packet содержит действующие credentials и call metadata, поэтому остаётся только под `/root`, mode `0700/0600`, не копируется в Git и не публикуется в PR.

```bash
set -eu
umask 077
GOD8_BACKUP_DIR="/root/god-8-backups/$(date -u +%Y%m%dT%H%M%SZ)"
case "$GOD8_BACKUP_DIR" in
  /root/god-8-backups/*) ;;
  *) printf 'Unsafe backup path: %s\n' "$GOD8_BACKUP_DIR" >&2; exit 1 ;;
esac
install -d -o root -g root -m 0700 "$GOD8_BACKUP_DIR"

install -o root -g root -m 0600 /etc/systemd/system/openclaw-gateway.service "$GOD8_BACKUP_DIR/openclaw-gateway.service"
install -o root -g root -m 0600 /root/.openclaw/openclaw.json "$GOD8_BACKUP_DIR/openclaw.json"
install -o root -g root -m 0600 /root/.openclaw/voice-calls/calls.jsonl "$GOD8_BACKUP_DIR/calls.jsonl"
install -o root -g root -m 0600 /opt/app/nginx/conf.d/default.conf "$GOD8_BACKUP_DIR/default.conf"
tar --create --gzip --file "$GOD8_BACKUP_DIR/voice-call-bundled.tgz" --directory /usr/lib/node_modules/openclaw/dist/extensions voice-call
tar --create --gzip --file "$GOD8_BACKUP_DIR/voice-call-local.tgz" --directory /root/.openclaw/workspace/plugins voice-call-local

systemctl show openclaw-gateway.service \
  -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState \
  -p FragmentPath -p MainPID -p WorkingDirectory -p Restart -p RestartUSec \
  -p EnvironmentFiles -p Requires -p Wants -p After -p Before -p ExecStart \
  > "$GOD8_BACKUP_DIR/systemd-show.txt"
ss -ltnp > "$GOD8_BACKUP_DIR/ss-before.txt"
ufw status numbered > "$GOD8_BACKUP_DIR/ufw-before.txt"
docker inspect --format='Name={{.Name}}
Image={{.Config.Image}}
Status={{.State.Status}}
RestartPolicy={{.HostConfig.RestartPolicy.Name}}
Mounts={{json .Mounts}}
Networks={{json .NetworkSettings.Networks}}
ComposeProject={{index .Config.Labels "com.docker.compose.project"}}
ComposeService={{index .Config.Labels "com.docker.compose.service"}}
ComposeConfigFiles={{index .Config.Labels "com.docker.compose.project.config_files"}}' nginx > "$GOD8_BACKUP_DIR/nginx-container.txt"
openclaw --version > "$GOD8_BACKUP_DIR/openclaw-version.txt"

(
  cd "$GOD8_BACKUP_DIR"
  sha256sum openclaw-gateway.service openclaw.json calls.jsonl default.conf voice-call-bundled.tgz voice-call-local.tgz > SHA256SUMS
  sha256sum --check SHA256SUMS
)
chmod 0600 "$GOD8_BACKUP_DIR"/*
printf '%s\n' "$GOD8_BACKUP_DIR" > /root/god-8-backups/LAST_PRE_TEARDOWN
printf 'Rollback packet: %s\n' "$GOD8_BACKUP_DIR"
```

Не продолжать, пока `sha256sum --check` не завершится без ошибок и точный path packet не будет записан в change evidence.

## 5. Gate 2 — reversible teardown

Шаги 5.1–5.3 выполняются в одном change window. При любой ошибке дальнейшие шаги прекращаются и применяется полный точный rollback из раздела 7; shared gateway нельзя оставлять в частично проверенном состоянии.

### 5.1 Заменить production proxy на точный 410

Patch меняет только один подтверждённый block текущего production-файла. Сначала синтаксис, затем reload. Base path без trailing slash добавлен отдельно, чтобы SPA не вернул homepage `200`.

```bash
set -eu
GOD8_BACKUP_DIR="$(cat /root/god-8-backups/LAST_PRE_TEARDOWN)"
python3 - <<'PY'
import os
from pathlib import Path

path = Path('/opt/app/nginx/conf.d/default.conf')
if path.is_symlink():
    raise SystemExit('Refusing to replace symlinked Nginx config')
old = '''    location /openclaw-voice/ {
        proxy_pass http://172.18.0.1:3334;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_redirect off;
    }
'''
new = '''    location = /openclaw-voice {
        return 410;
    }

    location ^~ /openclaw-voice/ {
        return 410;
    }
'''
text = path.read_text()
if text.count(old) != 1:
    raise SystemExit('Expected exactly one unchanged OpenClaw Voice proxy block')
temporary = path.with_name(path.name + '.god8.tmp')
if temporary.exists():
    raise SystemExit(f'Refusing to overwrite existing temporary file: {temporary}')
temporary.write_text(text.replace(old, new))
os.chmod(temporary, path.stat().st_mode & 0o777)
os.replace(temporary, path)
PY

if ! docker exec nginx nginx -t; then
  install -o root -g root -m 0644 "$GOD8_BACKUP_DIR/default.conf" /opt/app/nginx/conf.d/default.conf
  docker exec nginx nginx -t
  exit 1
fi
docker exec nginx nginx -s reload
```

### 5.2 Закрыть прямой firewall access

```bash
set -eu
ufw --force delete allow 3334/tcp
test "$(ufw status | grep -Ec '3334/tcp' || true)" = "0"
```

### 5.3 Отключить только bundled `voice-call`

Команда меняет `plugins.entries.voice-call.enabled`, но не удаляет config/secrets. Restart кратко прерывает shared gateway, поэтому этот шаг требует отдельного подтверждения окна работ.

```bash
set -eu
GOD8_BACKUP_DIR="$(cat /root/god-8-backups/LAST_PRE_TEARDOWN)"
rollback_voice_plugin() {
  install -o root -g root -m 0600 "$GOD8_BACKUP_DIR/openclaw.json" /root/.openclaw/openclaw.json
  openclaw config validate
  systemctl restart openclaw-gateway.service
}
if ! openclaw plugins disable voice-call || ! openclaw config validate; then
  rollback_voice_plugin
  exit 1
fi
if ! systemctl restart openclaw-gateway.service; then
  rollback_voice_plugin
  exit 1
fi
if ! test "$(systemctl is-active openclaw-gateway.service)" = "active" \
  || ! test "$(systemctl is-enabled openclaw-gateway.service)" = "enabled" \
  || ! test "$(openclaw config get plugins.entries.voice-call.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "false" \
  || ! test "$(openclaw config get channels.telegram.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "true" \
  || ! test "$(openclaw config get plugins.entries.minimax.enabled | tail -n1 | tr '[:upper:]' '[:lower:]')" = "true" \
  || ss -H -ltn '( sport = :3334 )' | grep -q .; then
  printf 'Shared-runtime or voice postcondition failed; restoring voice config\n' >&2
  rollback_voice_plugin
  exit 1
fi
```

## 6. Автоматическая проверка

Из checkout этого PR:

```bash
npm run test:openclaw-teardown
npm run verify:openclaw-teardown -- --ssh root@89.167.49.137
```

Verifier делает GET без follow redirects и требует:

- `410` для `/openclaw-voice`, `/openclaw-voice/` и deep path;
- отсутствие `Location` у tombstone;
- прежние `200` и тела для `/`, `/api/`, `/api/health`, `/voidplayer/`;
- отсутствие listener/UFW rule/proxy на `3334`;
- disabled `voice-call`, но active+enabled shared gateway и по-прежнему enabled Telegram/Minimax;
- валидный effective Nginx config.

## 7. Rollback reversible stage

Выполнять в обратном порядке. Все paths берутся из зафиксированного packet, без glob.

```bash
set -eu
GOD8_BACKUP_DIR="$(cat /root/god-8-backups/LAST_PRE_TEARDOWN)"
test -d "$GOD8_BACKUP_DIR"
(
  cd "$GOD8_BACKUP_DIR"
  sha256sum --check SHA256SUMS
)

install -o root -g root -m 0600 "$GOD8_BACKUP_DIR/openclaw.json" /root/.openclaw/openclaw.json
openclaw plugins enable voice-call
openclaw config validate
systemctl restart openclaw-gateway.service
test "$(systemctl is-active openclaw-gateway.service)" = "active"

ufw allow 3334/tcp
install -o root -g root -m 0644 "$GOD8_BACKUP_DIR/default.conf" /opt/app/nginx/conf.d/default.conf
docker exec nginx nginx -t
docker exec nginx nginx -s reload
ss -H -ltn '( sport = :3334 )'
ufw status numbered | grep '3334/tcp'
```

Восстановление исходного JSON уже возвращает `enabled=true`; дополнительный `plugins enable` намеренно идемпотентен и делает rollback-предпосылку явной.

## 8. Gate 3 — необратимый cleanup только после observation + нового follow-up

Этот раздел **не разрешён текущим checkpoint**. Перед ним нужны independent review, заданный оркестратором observation period и отдельное явное разрешение.

1. Подтвердить у владельцев Twilio/OpenAI, что три credential references не shared; revoke/rotate их у providers. Значения никогда не печатать в terminal/PR.
2. Удалить voice subtree и allow entry из current config, затем validate/restart:

   ```bash
   openclaw config unset plugins.entries.voice-call
   openclaw config set plugins.allow '["telegram","minimax"]' --strict-json
   openclaw config validate
   systemctl restart openclaw-gateway.service
   ```

3. После отдельного data-retention approval удалить только точный data file, затем пустой каталог:

   ```bash
   rm -- /root/.openclaw/voice-calls/calls.jsonl
   rmdir -- /root/.openclaw/voice-calls
   ```

4. Если review подтверждает, что `voice-call-local` — ненужная копия, удалить семь точных файлов и затем пустой каталог. Bundled directory внутри global package не удалять:

   ```bash
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/README.md
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/runtime-api.js
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/package.json
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/runtime-entry.js
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/api.js
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/index.js
   rm -- /root/.openclaw/workspace/plugins/voice-call-local/openclaw.plugin.json
   rmdir -- /root/.openclaw/workspace/plugins/voice-call-local
   ```

5. После закрытия rollback window обработать exact legacy backups, содержащие voice credentials: `openclaw.json.bak-`, `openclaw.json.bak-20260405-043525`, `openclaw.json.bak-20260405-044351`, `backups/openclaw-voice-switch-.json`. Их нельзя удалять или редактировать до отдельного retention решения; provider rotation делает старые значения недействующими.
6. Повторить verifier и secret-reference inventory. Не удалять `/root/.openclaw/backups/openclaw-20260403-225852/openclaw.json`: проверено, что voice subtree в нём отсутствует.

## 9. Текущий checkpoint для hand-off

- Gate 0: PASS `2026-08-24T05:12:40Z`; все четыре discovery hash совпали, shared unit active+enabled, voice/Telegram/Minimax были enabled.
- Execution contract head: `bf8d0c080896363e7fb32414fcdb68521e4bd6a4`.
- Gate 1: PASS `2026-08-24T05:13:47Z`; rollback packet `/root/god-8-backups/20260824T051347Z`, manifest PASS, directory mode `0700`, sensitive files mode `0600`. Содержимое packet не покидало production host.
- Gate 2: PASS `2026-08-24T05:16:36Z`; listener/UFW/proxy counts `0/0/0`, voice disabled, shared unit active+enabled, Telegram/Minimax enabled.
- Post-change hashes: config `9f6da7d134846c0f67682908e6662f8a332157304b62719bf3d3558abf92e22b`; Nginx `91b71576850ee1f1e60d558a7777137a37f5e44cb9a7c7685a5a3f8545dfc004`; unit и global OpenClaw hashes не изменились.
- Full verifier: PASS `2026-08-24T05:19:26Z`–`05:19:36Z`; public tombstones `410` без redirects, protected routes `200`, все host-инварианты совпали, Nginx syntax valid.
- Gate 3 не выполнялся. Credential rotation, удаление voice config/data/local copy/legacy backups и закрытие rollback packet запрещены до нового явного follow-up.

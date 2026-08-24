# GOD-10 — публичная утечка конфигурации API

## Результат

Значение раскрытого секрета нигде в репозитории и Jira не сохраняется. Публичная выдача была остановлена, PostgreSQL credential ротирован, stale-копия санитизирована, а API повторно проверен извне.

## Что произошло

Во время независимого review GOD-2 2026-08-23 `GET https://godmodetools.com/api/` вернул поле `database`, сформированное напрямую из `DATABASE_URL`. Поле содержало PostgreSQL connection URL с username/password. Причина — endpoint эхо-возвращал runtime configuration вместо фиксированного публичного status contract.

## Аварийные действия

1. Удалено поле `database` из live FastAPI response; backend перезапущен.
2. Публично подтверждено отсутствие connection URL и credential patterns.
3. PostgreSQL password ротирован; postgres и backend пересозданы с новым environment.
4. Из backend-контейнера подтверждено подключение с новым credential.
5. Одна stale-копия credential в старом `.env` backup санитизирована.
6. После recreate Nginx временно использовал старый container address и отвечал `502`; `nginx -t` и restart Nginx обновили upstream resolution.
7. Финальный внешний smoke подтвердил `200 application/json` для `/api/` и `/api/health`.

## Постоянный контракт

- Исходный код backend хранится в `backend/`.
- Ответы имеют фиксированную минимальную схему и не читают environment.
- Backend не использует БД, поэтому production container не должен получать `DATABASE_URL`.
- Docker image работает от непривилегированного пользователя и содержит только необходимые Python dependencies.
- `npm run test:backend-security` запускает регрессию с заведомо тестовым DSN и доказывает, что он не попадает в response.

## Production verification

После каждого backend deploy:

1. проверить container status и последние startup logs;
2. проверить внутренние `http://backend:8000/` и `/health` из Nginx network;
3. reload/restart Nginx после recreate backend, чтобы обновить upstream address;
4. проверить публичные `/api/` и `/api/health`: status, Content-Type, точный набор ключей;
5. проверить response bodies на URI/credential patterns, не печатая значения потенциальных secrets.

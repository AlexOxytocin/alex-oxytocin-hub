# Jira-lite workflow сайта

Обновлено: 2026-08-24, Jira `GOD-11`.

## Обычная разработка

Значимое изменение получает задачу Jira `GOD` с целью, областью, двумя-пятью
критериями и способом проверки. Мелкие части уже открытой работы остаются в ней,
а не превращаются в подзадачи.

Основной цикл:

```text
Jira → локальное изменение → затронутая проверка → короткий итог Jira
```

Ветка, PR, полный browser suite и deployment добавляются по реальному риску или
прямому запросу, а не автоматически.

## Проверки по области

| Изменение | Минимальная проверка |
| --- | --- |
| Текст или данные | schema/content/link test затронутого раздела |
| Компонент или CSS | затронутый browser test и нужные viewport |
| Route/locale/SEO | соответствующий URL/SEO contract test |
| Download/CV | генерация и contract test артефакта |
| Общая сборочная граница | `npm run build` или `npm test` по риску |

Full RU/EN visual matrix остаётся release gate и обязательна при затронутом
общем layout/design. Она не нужна для каждой правки текста, данных или tooling.

## Release

Production deployment остаётся отдельной Jira/release-работой. Для него
сохраняются GOD-9 staging, immutable artifact, rollback, routing/security gates
и проверка публичного URL. Локальный результат не закрывает production release.

## Граница продукта

Community Mini App живёт в `C:\Users\User\community_bot`. MySite отвечает только
за публичный сайт и возможную ссылку/маршрутизацию на приложение.

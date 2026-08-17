<!--
  release-guide.md
  CV Hub

  Created by Alexander Gusarov on 03.03.2026.
  @spartan121
-->

# Release Guide

CV Hub использует версионирование по принципу **Resume as Artifact**.

Каждый релиз = зафиксированная версия резюме. Когда добавится генерация PDF — он будет прикладываться как release asset прямо к тегу.

---

## Версионирование

Используй [Semantic Versioning](https://semver.org):

| Версия | Когда |
|--------|-------|
| `v1.0.0` | Первый публичный релиз |
| `v1.1.0` | Добавил новый опыт работы / проект |
| `v1.2.0` | Добавил новую фичу (тёмная тема, фильтры) |
| `v2.0.0` | Крупное изменение структуры или дизайна |

---

## Как создать релиз

### 1. Поставь git tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 2. Создай релиз на GitHub

Перейди в раздел **Releases → Draft a new release**.

- Tag: выбери тег который только что запушил
- Title: `v1.0.0 — Initial release` (или описание что изменилось)
- Description: кратко что в этой версии

### 3. Добавь описание изменений

Пример:

```
## What's new in v1.1.0

- Added 2 new projects to Showcase
- Updated summary and skills
- Improved mobile layout

## Resume
PDF attached below (coming in future versions)
```

---

## Шаблон описания релиза

```
## Changes

- 

## Resume data
Last updated: YYYY-MM-DD

## Notes
```

---

## Будущее

Когда будет готова генерация PDF через Playwright + GitHub Actions:
- PDF будет генерироваться автоматически при создании тега
- Прикладываться к релизу как asset
- Любой сможет скачать актуальное резюме прямо со страницы релизов
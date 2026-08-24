import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function exists(relativePath) {
  try { await access(new URL(relativePath, root)); return true; } catch { return false; }
}

async function built(relativePath) {
  return readFile(new URL(`dist/${relativePath}/index.html`, root), 'utf8');
}

test('RU and EN publish Home plus top-level placeholders while detail pages stay absent', async () => {
  for (const locale of ['ru', 'en']) {
    for (const section of ['', 'experience', 'projects', 'learning', 'community']) {
      assert.equal(await exists(`dist/${locale}/${section ? `${section}/` : ''}index.html`), true, `${locale}/${section}`);
    }
    for (const detail of ['experience/java', 'experience/changelog', 'projects/flatscanner']) {
      assert.equal(await exists(`dist/${locale}/${detail}/index.html`), false, `${locale}/${detail} must not be generated`);
    }
  }
  assert.equal(await exists('dist/es/index.html'), false);
});

test('every placeholder contains only one localized migration status in main content', async () => {
  const expected = {
    'ru/experience': ['Опыт и резюме', 'Переношу этот раздел в новую оболочку'],
    'ru/projects': ['Проекты', 'проверенные кейсы'],
    'ru/learning': ['Обучение', 'актуальные материалы'],
    'ru/community': ['Комьюнити', 'актуальная версия'],
    'en/experience': ['Experience and résumé', 'I’m moving this section into the new shell'],
    'en/projects': ['Projects', 'reviewed case studies'],
    'en/learning': ['Learning', 'current materials'],
    'en/community': ['Community', 'up-to-date version'],
  };

  for (const [route, [heading, status]] of Object.entries(expected)) {
    const html = await built(route);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? '';
    assert.match(main, new RegExp(`<h1[^>]*>${heading}</h1>`));
    assert.match(main, new RegExp(status));
    assert.equal((main.match(/<p>/gu) ?? []).length, 1, `${route} must have one status paragraph`);
    assert.doesNotMatch(main, /<h2|<article|<img|download|project-card|timeline|scenario/iu);
  }
});

test('existing résumé downloads remain exact artifacts without publishing résumé detail pages', async () => {
  for (const locale of ['ru', 'en']) {
    for (const profile of ['', '_java']) {
      for (const extension of ['pdf', 'docx', 'txt']) {
        const profilePath = profile ? 'java/' : '';
        assert.equal(
          await exists(`dist/${locale}/experience/${profilePath}downloads/resume_${locale}${profile}.${extension}`),
          true,
        );
      }
    }
    assert.equal(await exists(`dist/${locale}/experience/java/index.html`), false);
  }
});

test('built pages contain no links to retired content subdomains', async () => {
  const htmlFiles = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(fullPath);
      else if (entry.name.endsWith('.html')) htmlFiles.push(fullPath);
    }
  }
  await collect(fileURLToPath(new URL('dist/', root)));

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /https:\/\/(?:cv|ai|allo)\.godmodetools\.com/i, file);
  }
});

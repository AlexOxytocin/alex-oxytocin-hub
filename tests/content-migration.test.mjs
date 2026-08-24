import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';

const root = new URL('../', import.meta.url);

async function exists(relativePath) {
  try { await access(new URL(relativePath, root)); return true; } catch { return false; }
}

async function built(relativePath) {
  return readFile(new URL(`dist/${relativePath}/index.html`, root), 'utf8');
}

async function projectSource(locale) {
  return YAML.parse(await readFile(new URL(`src/content/showcase/projects_${locale}.yaml`, root), 'utf8'));
}

test('RU and EN publish the full page set while ES remains unavailable', async () => {
  for (const locale of ['ru', 'en']) {
    const projects = await projectSource(locale);
    for (const section of ['', 'experience', 'experience/java', 'projects', 'learning', 'community']) {
      assert.equal(await exists(`dist/${locale}/${section ? `${section}/` : ''}index.html`), true, `${locale}/${section}`);
    }
    for (const project of projects.projects) {
      assert.equal(await exists(`dist/${locale}/projects/${project.slug}/index.html`), true, `${locale}/${project.slug}`);
    }
  }
  assert.equal(await exists('dist/es/index.html'), false);
});

test('learning and community have complete, independently localized copy', async () => {
  const [ruLearning, enLearning, ruCommunity, enCommunity] = await Promise.all([
    built('ru/learning'), built('en/learning'), built('ru/community'), built('en/community'),
  ]);
  assert.match(ruLearning, /Ответ — это ещё не выполненная задача/);
  assert.match(ruLearning, /Личный ассистент с памятью/);
  assert.match(enLearning, /An answer is not a completed task/);
  assert.match(enLearning, /A personal assistant with memory/);
  assert.doesNotMatch(enLearning, /Соберите|Бесплатный чек-ап/);
  assert.match(ruCommunity, /Технологии существуют внутри жизни/);
  assert.match(enCommunity, /Technology belongs inside life/);
});

test('all project records render as localized detail pages with matching alternates', async () => {
  const [ru, en] = await Promise.all([projectSource('ru'), projectSource('en')]);
  assert.equal(ru.projects.length, 14);
  assert.deepEqual(ru.projects.map(({ slug }) => slug), en.projects.map(({ slug }) => slug));

  for (const project of en.projects) {
    const html = await built(`en/projects/${project.slug}`);
    assert.match(html, new RegExp(`canonical" href="https://godmodetools\\.com/en/projects/${project.slug}/`));
    assert.match(html, new RegExp(`hreflang="ru" href="https://godmodetools\\.com/ru/projects/${project.slug}/`));
    assert.ok(html.includes(project.name.replaceAll('&', '&amp;')), project.name);
  }
});

test('CV profile pages and PDF, DOCX, and TXT downloads remain available', async () => {
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
    const java = await built(`${locale}/experience/java`);
    assert.match(java, new RegExp(`canonical" href="https://godmodetools\\.com/${locale}/experience/java/`));
    assert.match(java, new RegExp(`/${locale}/experience/java/downloads/resume_${locale}_java\\.pdf`));
  }
});

test('built pages contain no migration placeholders or links back to retired content subdomains', async () => {
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
    assert.doesNotMatch(html, /GOD-5|complete content moves|полный контент|shared content architecture/i, file);
    assert.doesNotMatch(html, /https:\/\/(?:cv|ai|allo)\.godmodetools\.com/i, file);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function readBuiltPage(locale, section = '') {
  const suffix = section ? `${locale}/${section}/index.html` : `${locale}/index.html`;
  return readFile(new URL(`dist/${suffix}`, root), 'utf8');
}

const routes = ['experience', 'projects', 'learning', 'community'];
const headings = {
  ru: ['Опыт и резюме', 'Проекты', 'Обучение', 'Комьюнити'],
  en: ['Experience and résumé', 'Projects', 'Learning', 'Community'],
};

test('build emits Home and four placeholders for RU/EN only', async () => {
  for (const locale of ['ru', 'en']) {
    const home = await readBuiltPage(locale);
    assert.match(home, new RegExp(`<html lang="${locale}"`));

    for (const [index, route] of routes.entries()) {
      const html = await readBuiltPage(locale, route);
      assert.match(html, new RegExp(`data-route="${route}"`));
      assert.match(html, new RegExp(`<h1 id="placeholder-heading">${headings[locale][index]}</h1>`));
      assert.match(html, /<meta name="robots" content="noindex, follow">/);
      assert.equal((html.match(/class="placeholder-page__panel"/gu) ?? []).length, 1);
    }
  }

  await assert.rejects(readBuiltPage('es'), /ENOENT/);
});

test('English and Russian Home remain localized and canonical', async () => {
  const [ru, en] = await Promise.all([readBuiltPage('ru'), readBuiltPage('en')]);

  assert.match(ru, /<title>Алексей Грищенко — архитектура, разработка и ИИ — God Mode Tools<\/title>/);
  assert.match(ru, /Разрабатываю <span class="home-hero__accent">ИИ-инструменты<\/span> и автоматизирую процессы/);
  assert.match(ru, /rel="canonical" href="https:\/\/godmodetools\.com\/ru\/"/);

  assert.match(en, /<title>Aleksei Grishchenko — architecture, engineering, and AI — God Mode Tools<\/title>/);
  assert.match(en, /I build <span class="home-hero__accent">AI tools<\/span> and automate processes/);
  assert.match(en, /rel="canonical" href="https:\/\/godmodetools\.com\/en\/"/);
});

test('navigation and locale switching use locale-first registry paths without JavaScript', async () => {
  const html = await readBuiltPage('ru', 'projects');

  for (const href of ['/ru/', '/ru/experience/', '/ru/projects/', '/ru/learning/', '/ru/community/']) {
    assert.ok(html.includes(`href="${href}"`), `missing navigation link ${href}`);
  }

  assert.match(html, /href="\/en\/projects\/" lang="en"/);
  assert.match(html, /href="\/ru\/projects\/" lang="ru" aria-current="page"/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /project-card|timeline-item|scenario-grid|community-network-art/);
});

test('custom 404 is crawl-safe and links back to the Russian Home route', async () => {
  const html = await readFile(new URL('dist/404.html', root), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<h1>Страница не найдена<\/h1>/);
  assert.match(html, /href="\/ru\/"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

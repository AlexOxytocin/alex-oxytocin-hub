import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function readBuiltPage(locale, section = '') {
  const suffix = section ? `${locale}/${section}/index.html` : `${locale}/index.html`;
  return readFile(new URL(`dist/${suffix}`, root), 'utf8');
}

const routes = ['experience', 'projects', 'learning', 'community'];

test('build emits every published locale-first route and no unpublished Spanish route', async () => {
  for (const locale of ['ru', 'en']) {
    const home = await readBuiltPage(locale);
    assert.match(home, new RegExp(`<html lang="${locale}"`));

    for (const route of routes) {
      const html = await readBuiltPage(locale, route);
      assert.match(html, new RegExp(`data-route="${route}"`));
    }
  }

  await assert.rejects(readBuiltPage('es'), /ENOENT/);
});

test('English and Russian pages carry localized copy and canonical metadata', async () => {
  const [ru, en] = await Promise.all([readBuiltPage('ru'), readBuiltPage('en')]);

  assert.match(ru, /<title>Главная — God Mode Tools<\/title>/);
  assert.match(ru, /Один быстрый сайт вместо набора поддоменов/);
  assert.match(ru, /rel="canonical" href="https:\/\/godmodetools\.com\/ru\/"/);
  assert.match(ru, /hreflang="en" href="https:\/\/godmodetools\.com\/en\/"/);

  assert.match(en, /<title>Home — God Mode Tools<\/title>/);
  assert.match(en, /One fast site instead of scattered subdomains/);
  assert.match(en, /rel="canonical" href="https:\/\/godmodetools\.com\/en\/"/);
  assert.match(en, /hreflang="ru" href="https:\/\/godmodetools\.com\/ru\/"/);
});

test('navigation is complete, locale-aware, and generated without client JavaScript', async () => {
  const html = await readBuiltPage('ru', 'projects');

  for (const href of ['/ru/', '/ru/experience/', '/ru/projects/', '/ru/learning/', '/ru/community/']) {
    assert.ok(html.includes(`href="${href}"`), `missing navigation link ${href}`);
  }

  assert.match(html, /href="\/en\/projects\/" lang="en"/);
  assert.match(html, /href="\/ru\/projects\/" lang="ru" aria-current="page"/);
  assert.doesNotMatch(html, /<script\b/i);
});

test('custom 404 is crawl-safe and links back to the Russian home route', async () => {
  const html = await readFile(new URL('dist/404.html', root), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<h1>Страница не найдена<\/h1>/);
  assert.match(html, /href="\/ru\/"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

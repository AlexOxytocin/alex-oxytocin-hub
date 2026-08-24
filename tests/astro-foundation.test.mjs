import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, root));
    return true;
  } catch {
    return false;
  }
}

test('root package is the only frontend dependency source', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

  assert.equal(await exists('package-lock.json'), true);
  assert.equal(await exists('sites/cv/package.json'), false);
  assert.equal(await exists('sites/cv/package-lock.json'), false);
  assert.equal(await exists('sites/ai/website/package.json'), false);
  assert.equal(await exists('sites/ai/website/package-lock.json'), false);
  assert.equal(packageJson.dependencies.astro, '7.2.4');

  for (const retiredRuntime of ['vinext', 'react', 'react-dom', 'react-server-dom-webpack']) {
    assert.equal(packageJson.dependencies[retiredRuntime], undefined);
    assert.equal(packageJson.devDependencies[retiredRuntime], undefined);
  }
});

test('locale registry publishes RU and EN while reserving ES', async () => {
  const locales = JSON.parse(await readFile(new URL('src/content/locales.json', root), 'utf8'));
  assert.deepEqual(
    locales.map(({ id, published }) => ({ id, published })),
    [
      { id: 'ru', published: true },
      { id: 'en', published: true },
      { id: 'es', published: false },
    ],
  );

  const routeRegistry = await readFile(new URL('src/config/routes.ts', root), 'utf8');
  for (const route of ['home', 'experience', 'projects', 'learning', 'community']) {
    assert.match(routeRegistry, new RegExp(`\\b${route}\\b`));
  }
  assert.match(routeRegistry, /function routePath\(/);
  assert.match(routeRegistry, /robots: 'noindex, follow'/);
  assert.match(routeRegistry, /detailRouteContracts/);
  assert.match(routeRegistry, /action: 'not_found'/);
});

test('page and layout templates do not hardcode localized internal links', async () => {
  const templates = [
    'src/components/PageShell.astro',
    'src/components/SEO.astro',
    'src/components/SiteHeader.astro',
    'src/layouts/BaseLayout.astro',
    'src/pages/404.astro',
    'src/pages/[locale]/index.astro',
    'src/pages/[locale]/[section].astro',
  ];

  for (const template of templates) {
    const source = await readFile(new URL(template, root), 'utf8');
    assert.doesNotMatch(source, /(?:href|src)=["']\/(?:ru|en|es)(?:\/|["'])/);
  }
});

test('Astro content schemas cover locales, pages, profiles, projects, and CV data', async () => {
  const config = await readFile(new URL('src/content.config.ts', root), 'utf8');
  for (const collection of ['locales', 'pages', 'profiles', 'projects', 'cv']) {
    assert.match(config, new RegExp(`\\b${collection}\\b`));
  }

  assert.match(config, /astro\/loaders/);
  assert.match(config, /astro\/zod/);
  assert.equal(await exists('src/content/cv/ru.yaml'), true);
  assert.equal(await exists('src/content/showcase/projects_en.yaml'), true);
  assert.equal(await exists('src/content/profiles/profiles.yml'), true);
});

test('CV pipeline is available from the root and its generated downloads ship in dist', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(packageJson.scripts['cv:build'], 'node scripts/cv/merge.mjs');
  assert.equal(packageJson.scripts['resume:generate'], 'node scripts/cv/generate-resume.js');

  for (const locale of ['en', 'ru']) {
    for (const extension of ['txt', 'docx']) {
      assert.equal(await exists(`dist/${locale}/experience/downloads/resume_${locale}.${extension}`), true);
      assert.equal(await exists(`dist/${locale}/experience/java/downloads/resume_${locale}_java.${extension}`), true);
    }
  }
  assert.equal(await exists('dist/downloads'), false);
});

test('release is static and leaves the root redirect to the HTTP layer', async () => {
  assert.equal(await exists('dist/index.html'), false);
  assert.equal(await exists('dist/ru/index.html'), true);
  assert.equal(await exists('dist/en/index.html'), true);

  const sitemap = await readFile(new URL('dist/sitemap.xml', root), 'utf8');
  assert.match(sitemap, /<urlset\b/);
  assert.doesNotMatch(sitemap, /\/(?:experience|projects|learning|community)\//);
  assert.match(sitemap, /https:\/\/godmodetools\.com\/(?:ru|en)\//);
  assert.doesNotMatch(sitemap, /\/es\//);
});

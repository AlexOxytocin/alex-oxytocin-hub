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

test('design tokens are centralized and Home styles stay route-local', async () => {
  const [tokens, machineTokens, entrypoint, layout, homePage, homeTheme, homeStyles] = await Promise.all([
    readFile(new URL('src/styles/tokens.css', root), 'utf8'),
    readFile(new URL('docs/design-tokens.json', root), 'utf8'),
    readFile(new URL('src/styles/index.css', root), 'utf8'),
    readFile(new URL('src/layouts/BaseLayout.astro', root), 'utf8'),
    readFile(new URL('src/components/pages/HomePage.astro', root), 'utf8'),
    readFile(new URL('src/styles/themes/legacy-home.css', root), 'utf8'),
    readFile(new URL('src/styles/home.css', root), 'utf8'),
  ]);

  for (const token of ['--surface-page', '--text-primary', '--space-4', '--radius-lg', '--motion-normal', '--touch-target']) {
    assert.match(tokens, new RegExp(token));
  }
  assert.doesNotThrow(() => JSON.parse(machineTokens));
  assert.match(layout, /import '\.\.\/styles\/index\.css';/);

  for (const stylesheet of ['tokens.css', 'base.css', 'components.css', 'motion.css']) {
    assert.match(entrypoint, new RegExp(`@import './${stylesheet.replace('.', '\\.')}';`));
  }

  assert.doesNotMatch(entrypoint, /legacy-home|home\.css/);
  assert.match(homePage, /import '\.\.\/\.\.\/styles\/themes\/legacy-home\.css';/);
  assert.match(homePage, /import '\.\.\/\.\.\/styles\/home\.css';/);

  for (const token of [
    '--font-sans',
    '--home-page-background',
    '--home-hero-radius',
    '--home-hero-shadow',
    '--home-page-gutter',
    '--home-heading-font-size',
  ]) {
    assert.match(homeTheme, new RegExp(token), `${token} missing from the Home semantic theme`);
  }
  assert.match(homeStyles, /var\(--home-hero-radius\)/);
  assert.match(homeStyles, /var\(--home-heading-font-size\)/);

  for (const stylesheet of ['src/styles/base.css', 'src/styles/components.css', 'src/styles/motion.css', 'src/styles/home.css']) {
    const source = await readFile(new URL(stylesheet, root), 'utf8');
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${stylesheet} contains a raw color`);
  }
});

test('shared layout owns header, footer, and reusable UI primitives', async () => {
  const layout = await readFile(new URL('src/layouts/BaseLayout.astro', root), 'utf8');
  assert.match(layout, /<SiteHeader/);
  assert.match(layout, /<SiteFooter/);

  for (const component of ['Container', 'Section', 'Stack', 'Button', 'Card']) {
    assert.equal(await exists(`src/components/ui/${component}.astro`), true, `${component} missing`);
  }
  assert.equal(await exists('src/components/CTA.astro'), true);
});

test('motion policy enforces reduced-motion, device, visibility, and viewport gates', async () => {
  const [policy, controller, css, boundary] = await Promise.all([
    readFile(new URL('src/scripts/motion-policy.ts', root), 'utf8'),
    readFile(new URL('src/scripts/ambient-field.ts', root), 'utf8'),
    readFile(new URL('src/styles/motion.css', root), 'utf8'),
    readFile(new URL('src/components/motion/MotionBoundary.astro', root), 'utf8'),
  ]);

  assert.match(policy, /prefers-reduced-motion: reduce/);
  assert.match(policy, /hardwareConcurrency/);
  assert.match(policy, /max-width/);
  assert.match(policy, /requestIdleCallback/);
  assert.match(controller, /IntersectionObserver/);
  assert.match(controller, /visibilitychange/);
  assert.match(controller, /addEventListener\('change', onPolicyChange\)/);
  assert.match(controller, /cancelAnimationFrame/);
  assert.match(controller, /pagehide/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /aspect-ratio: var\(--motion-aspect-ratio/);
  assert.match(boundary, /data-motion-state="static"/);
});

test('Home and static content pages keep a zero-JS shell', async () => {
  const [home, projects] = await Promise.all([
    readFile(new URL('dist/ru/index.html', root), 'utf8'),
    readFile(new URL('dist/ru/projects/index.html', root), 'utf8'),
  ]);

  assert.doesNotMatch(home, /data-ambient-canvas/);
  assert.doesNotMatch(home, /<script\b/);
  assert.match(home, /data-theme="legacy-home"/);
  assert.doesNotMatch(projects, /data-ambient-canvas/);
  assert.doesNotMatch(projects, /<script\b/);
  assert.doesNotMatch(projects, /data-theme="legacy-home"/);
});

test('built non-Home pages do not receive Home theme CSS', async () => {
  async function renderedStyles(pagePath) {
    const html = await readFile(new URL(pagePath, root), 'utf8');
    const linked = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>/g)].map((match) => match[1]);
    const files = await Promise.all(linked.map((href) => readFile(new URL(`dist/${href.replace(/^\//, '')}`, root), 'utf8')));
    return `${[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')}\n${files.join('\n')}`;
  }

  const [homeStyles, projectStyles] = await Promise.all([
    renderedStyles('dist/ru/index.html'),
    renderedStyles('dist/ru/projects/index.html'),
  ]);
  assert.match(homeStyles, /--home-color-page/);
  assert.match(homeStyles, /\.home-hero__primary/);
  assert.doesNotMatch(projectStyles, /--home-color-page/);
  assert.doesNotMatch(projectStyles, /\.home-hero__primary/);
});

test('self-contained design preview and rationale are versioned with the system', async () => {
  const [preview, rationale] = await Promise.all([
    readFile(new URL('docs/design-preview.html', root), 'utf8'),
    readFile(new URL('docs/DESIGN.md', root), 'utf8'),
  ]);

  assert.doesNotMatch(preview, /<(?:link|script)[^>]+(?:src|href)=["']https?:/i);
  assert.match(preview, /data-density/);
  assert.match(preview, /prefers-reduced-motion/);
  assert.match(rationale, /Brittany Chiang/);
  assert.match(rationale, /Lee Robinson/);
  assert.match(rationale, /Rauno Freiberg/);
});

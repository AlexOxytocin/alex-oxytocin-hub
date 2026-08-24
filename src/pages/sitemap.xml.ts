import type { APIRoute } from 'astro';
import {
  changelogPath,
  profilePath,
  projectPath,
  publishedLocales,
  routeIds,
  routePath,
  type Locale,
} from '../config/routes';
import { siteConfig } from '../config/site';
import { getProfiles, getProjects } from '../content/site-content';

export const prerender = true;

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function absolute(pathname: string): string {
  return new URL(pathname, siteConfig.url).href;
}

function localizedPaths(pathFor: (locale: Locale) => string): Record<string, string> {
  return Object.fromEntries(publishedLocales.map(({ id }) => [id, pathFor(id)]));
}

export const GET: APIRoute = async () => {
  const profiles = await getProfiles();
  const projectsByLocale = new Map(await Promise.all(publishedLocales.map(async ({ id }) => (
    [id, await getProjects(id)] as const
  ))));
  const referenceSlugs = projectsByLocale.get(siteConfig.defaultLocale)!.projects.map(({ slug }) => slug).sort();

  for (const { id } of publishedLocales) {
    const slugs = projectsByLocale.get(id)!.projects.map(({ slug }) => slug).sort();
    if (slugs.join('\n') !== referenceSlugs.join('\n')) {
      throw new Error(`Project sitemap parity mismatch for ${id}`);
    }
  }

  const groups = [
    ...routeIds.map((route) => localizedPaths((locale) => routePath(locale, route))),
    ...profiles.filter(({ slug }) => slug).map(({ slug }) => localizedPaths((locale) => profilePath(locale, slug))),
    localizedPaths((locale) => changelogPath(locale)),
    ...referenceSlugs.map((slug) => localizedPaths((locale) => projectPath(locale, slug))),
  ];

  const urls = groups.flatMap((paths) => publishedLocales.map(({ id }) => {
    const alternates = publishedLocales.map((alternate) => (
      `    <xhtml:link rel="alternate" hreflang="${xml(alternate.htmlLang)}" href="${xml(absolute(paths[alternate.id]!))}" />`
    ));
    alternates.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(absolute(paths.ru!))}" />`);
    return [
      '  <url>',
      `    <loc>${xml(absolute(paths[id]!))}</loc>`,
      ...alternates,
      '  </url>',
    ].join('\n');
  }));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

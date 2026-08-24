import localeRecords from '../content/locales.json';

export const routeIds = ['home', 'experience', 'projects', 'learning', 'community'] as const;
export const sectionRouteIds = ['experience', 'projects', 'learning', 'community'] as const;
export type RouteId = (typeof routeIds)[number];
export type SectionRouteId = (typeof sectionRouteIds)[number];
export type Locale = 'ru' | 'en' | 'es';

export interface LocaleDefinition {
  id: Locale;
  label: string;
  name: string;
  htmlLang: string;
  ogLocale: string;
  published: boolean;
}

export const locales = localeRecords as LocaleDefinition[];
export const publishedLocales = locales.filter((locale) => locale.published);

export const routeSegments: Record<RouteId, string> = {
  home: '',
  experience: 'experience',
  projects: 'projects',
  learning: 'learning',
  community: 'community',
};

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale.id === value);
}

export function isPublishedLocale(value: string): value is Locale {
  return publishedLocales.some((locale) => locale.id === value);
}

export function localeDefinition(locale: Locale): LocaleDefinition {
  const definition = locales.find((candidate) => candidate.id === locale);
  if (!definition) throw new Error(`Unknown locale: ${locale}`);
  return definition;
}

export function routePath(locale: Locale, route: RouteId): string {
  const segment = routeSegments[route];
  return segment ? `/${locale}/${segment}/` : `/${locale}/`;
}

export function profilePath(locale: Locale, profileSlug = ''): string {
  const base = routePath(locale, 'experience');
  return profileSlug ? `${base}${profileSlug}/` : base;
}

export function projectPath(locale: Locale, projectSlug: string): string {
  return `${routePath(locale, 'projects')}${projectSlug}/`;
}

export function routeIdFromSection(section: string): SectionRouteId | undefined {
  return sectionRouteIds.find((route) => routeSegments[route] === section);
}

export function routeEntries(locale: Locale) {
  return routeIds.map((route) => ({ route, href: routePath(locale, route) }));
}

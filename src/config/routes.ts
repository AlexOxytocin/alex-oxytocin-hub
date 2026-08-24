import localeRecords from '../content/locales.json';

export type CrawlDirective = 'index, follow' | 'noindex, follow' | 'noindex, nofollow';

export const routeRegistry = {
  home: {
    segment: '',
    state: 'ready',
    robots: 'index, follow',
  },
  experience: {
    segment: 'experience',
    state: 'placeholder',
    robots: 'noindex, follow',
  },
  projects: {
    segment: 'projects',
    state: 'placeholder',
    robots: 'noindex, follow',
  },
  learning: {
    segment: 'learning',
    state: 'placeholder',
    robots: 'noindex, follow',
  },
  community: {
    segment: 'community',
    state: 'placeholder',
    robots: 'noindex, follow',
  },
} as const satisfies Record<string, {
  segment: string;
  state: 'ready' | 'placeholder';
  robots: CrawlDirective;
}>;

export type RouteId = keyof typeof routeRegistry;
export type SectionRouteId = Exclude<RouteId, 'home'>;
export const routeIds = Object.keys(routeRegistry) as RouteId[];
export const sectionRouteIds = routeIds.filter((route): route is SectionRouteId => route !== 'home');
export const indexableRouteIds = routeIds.filter((route) => routeRegistry[route].robots === 'index, follow');
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

export const routeSegments = Object.fromEntries(
  routeIds.map((route) => [route, routeRegistry[route].segment]),
) as Record<RouteId, string>;

export const detailRouteContracts = {
  experienceProfile: {
    pattern: '/{locale}/experience/{profile}/',
    action: 'not_found',
    status: 404,
    fallbackRoute: 'experience',
  },
  experienceChangelog: {
    pattern: '/{locale}/experience/changelog/',
    action: 'not_found',
    status: 404,
    fallbackRoute: 'experience',
  },
  project: {
    pattern: '/{locale}/projects/{slug}/',
    action: 'not_found',
    status: 404,
    fallbackRoute: 'projects',
  },
} as const satisfies Record<string, {
  pattern: string;
  action: 'not_found';
  status: 404;
  fallbackRoute: SectionRouteId;
}>;

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
  const segment = routeRegistry[route].segment;
  return segment ? `/${locale}/${segment}/` : `/${locale}/`;
}

export function routeRobots(route: RouteId): CrawlDirective {
  return routeRegistry[route].robots;
}

export function routeIdFromSection(section: string): SectionRouteId | undefined {
  return sectionRouteIds.find((route) => routeSegments[route] === section);
}

export function routeEntries(locale: Locale) {
  return routeIds.map((route) => ({ route, href: routePath(locale, route) }));
}

export function localeRouteEntries(route: RouteId) {
  return publishedLocales.map((locale) => ({
    locale,
    href: routePath(locale.id, route),
  }));
}

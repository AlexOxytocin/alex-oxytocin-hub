import type { Locale, RouteId } from '../config/routes';

type PublishedLocale = Exclude<Locale, 'es'>;

const navigation: Record<PublishedLocale, Record<RouteId, string>> = {
  ru: {
    home: 'Главная',
    experience: 'Опыт',
    projects: 'Проекты',
    learning: 'Обучение',
    community: 'Комьюнити',
  },
  en: {
    home: 'Home',
    experience: 'Experience',
    projects: 'Projects',
    learning: 'Learning',
    community: 'Community',
  },
};

export function navigationLabel(locale: Locale, route: RouteId): string {
  if (locale === 'es') return route;
  return navigation[locale][route];
}

export function interfaceCopy(locale: Locale) {
  return locale === 'en'
    ? {
        skip: 'Skip to content',
        navigation: 'Main navigation',
        languages: 'Choose language',
        foundation: 'Unified Astro foundation',
      }
    : {
        skip: 'Перейти к содержанию',
        navigation: 'Основная навигация',
        languages: 'Выбор языка',
        foundation: 'Единый Astro-фундамент',
      };
}

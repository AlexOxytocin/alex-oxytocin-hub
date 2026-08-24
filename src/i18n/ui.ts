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
        social: 'Social links',
        homeBrand: 'Alex Oxytocin — home',
        homeEvidence: 'Experience in numbers',
        homeDirections: 'Directions',
        foundation: 'Unified Astro foundation',
        homeFooter: 'Aleksei Grishchenko · AI Solutions Architect · Buenos Aires',
        footer: 'Architecture, AI tools, learning, and community.',
        rights: 'Built as one fast, accessible system.',
      }
    : {
        skip: 'Перейти к содержанию',
        navigation: 'Основная навигация',
        languages: 'Выбор языка',
        social: 'Ссылки на социальные сети',
        homeBrand: 'Alex Oxytocin — на главную',
        homeEvidence: 'Опыт в цифрах',
        homeDirections: 'Направления',
        foundation: 'Единый Astro-фундамент',
        homeFooter: 'Алексей Грищенко · AI Solutions Architect · Buenos Aires',
        footer: 'Архитектура, ИИ-инструменты, обучение и сообщество.',
        rights: 'Собрано как одна быстрая и доступная система.',
      };
}

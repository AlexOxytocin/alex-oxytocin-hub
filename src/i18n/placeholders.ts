import type { Locale, SectionRouteId } from '../config/routes';

interface PlaceholderCopy {
  title: string;
  description: string;
  heading: string;
  status: string;
}

type PublishedLocale = Exclude<Locale, 'es'>;

const placeholders: Record<PublishedLocale, Record<SectionRouteId, PlaceholderCopy>> = {
  ru: {
    experience: {
      title: 'Опыт',
      description: 'Раздел об опыте и резюме готовится к переносу.',
      heading: 'Опыт и резюме',
      status: 'Переношу этот раздел в новую оболочку — скоро здесь появится проверенная версия.',
    },
    projects: {
      title: 'Проекты',
      description: 'Раздел с проектами готовится к переносу.',
      heading: 'Проекты',
      status: 'Переношу этот раздел в новую оболочку — скоро здесь появятся проверенные кейсы.',
    },
    learning: {
      title: 'Обучение',
      description: 'Раздел об обучении готовится к переносу.',
      heading: 'Обучение',
      status: 'Переношу этот раздел в новую оболочку — скоро здесь появятся актуальные материалы.',
    },
    community: {
      title: 'Комьюнити',
      description: 'Раздел сообщества готовится к переносу.',
      heading: 'Комьюнити',
      status: 'Переношу этот раздел в новую оболочку — скоро здесь появится актуальная версия.',
    },
  },
  en: {
    experience: {
      title: 'Experience',
      description: 'The experience and résumé section is being prepared for migration.',
      heading: 'Experience and résumé',
      status: 'I’m moving this section into the new shell; a reviewed version will be here soon.',
    },
    projects: {
      title: 'Projects',
      description: 'The projects section is being prepared for migration.',
      heading: 'Projects',
      status: 'I’m moving this section into the new shell; reviewed case studies will be here soon.',
    },
    learning: {
      title: 'Learning',
      description: 'The learning section is being prepared for migration.',
      heading: 'Learning',
      status: 'I’m moving this section into the new shell; current materials will be here soon.',
    },
    community: {
      title: 'Community',
      description: 'The community section is being prepared for migration.',
      heading: 'Community',
      status: 'I’m moving this section into the new shell; an up-to-date version will be here soon.',
    },
  },
};

export function placeholderCopy(locale: Locale, route: SectionRouteId): PlaceholderCopy {
  if (locale === 'es') throw new Error('Spanish placeholders are not published');
  return placeholders[locale][route];
}

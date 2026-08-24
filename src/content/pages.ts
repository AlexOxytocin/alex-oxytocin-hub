import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale, RouteId } from '../config/routes';

export type PageContent = CollectionEntry<'pages'>['data'];

export async function getPublishedPage(locale: Locale, route: RouteId): Promise<PageContent> {
  const entries = await getCollection('pages', ({ data }) => (
    data.locale === locale && data.route === route && data.status === 'published'
  ));

  if (entries.length !== 1) {
    throw new Error(`Expected one published page for ${locale}/${route}, found ${entries.length}`);
  }

  return entries[0]!.data;
}

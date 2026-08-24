import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../config/routes';

export type CvContent = CollectionEntry<'cv'>['data'];
export type ProjectCollection = CollectionEntry<'projects'>['data'];
export type ProjectContent = ProjectCollection['projects'][number];

export interface ProfileDefinition {
  id: string;
  label: string;
  slug: string;
  spec?: string | null | undefined;
}

export async function getCv(locale: Locale, profileSlug = ''): Promise<CvContent> {
  const id = profileSlug ? `${locale}_${profileSlug}` : locale;
  const entries = await getCollection('cv');
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing CV content: ${id}`);
  return entry.data;
}

export async function getProfiles(): Promise<ProfileDefinition[]> {
  const entries = await getCollection('profiles');
  if (entries.length !== 1) throw new Error(`Expected one profile registry, found ${entries.length}`);
  return entries[0]!.data.profiles;
}

export async function getProjects(locale: Locale): Promise<ProjectCollection> {
  const entries = await getCollection('projects');
  const entry = entries.find((candidate) => candidate.id === `projects_${locale}`);
  if (!entry) throw new Error(`Missing project collection for ${locale}`);
  return entry.data;
}

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localeId = z.enum(['ru', 'en', 'es']);
const routeId = z.enum(['home', 'experience', 'projects', 'learning', 'community']);

const locales = defineCollection({
  loader: file('src/content/locales.json'),
  schema: z.object({
    id: localeId,
    label: z.string().min(2),
    name: z.string().min(2),
    htmlLang: z.string().min(2),
    ogLocale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/),
    published: z.boolean(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/pages' }),
  schema: z.object({
    locale: localeId,
    route: routeId,
    status: z.enum(['draft', 'published']),
    title: z.string().min(1),
    description: z.string().min(1),
    eyebrow: z.string().min(1),
    heading: z.string().min(1),
    intro: z.string().min(1),
  }),
});

const profiles = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './src/content/profiles' }),
  schema: z.object({
    profiles: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      slug: z.string(),
      spec: z.string().nullable().optional(),
    })),
  }),
});

const projectLink = z.object({
  label: z.string().optional().default(''),
  url: z.string().optional().default(''),
  type: z.enum(['repo', 'demo', 'store', 'product', 'video', 'article', 'press', 'other']).optional().default('other'),
});

const projectMedia = z.object({
  type: z.enum(['image', 'gif', 'video']).optional().default('image'),
  src: z.string().optional().default(''),
  alt: z.string().optional().default(''),
  featured: z.boolean().optional().default(false),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './src/content/showcase' }),
  schema: z.object({
    intro: z.string().optional().default(''),
    groups: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional().default(''),
      project_slugs: z.array(z.string()).optional().default([]),
    })).optional().default([]),
    approaches: z.array(z.object({
      title: z.string().min(1),
      description: z.string().min(1),
    })).optional().default([]),
    projects: z.array(z.looseObject({
      slug: z.string().min(1),
      name: z.string().min(1),
      order: z.coerce.number().optional(),
      category: z.string().optional().default(''),
      role: z.string().optional().default(''),
      year: z.union([z.string(), z.number()]).transform(String).optional().default(''),
      description: z.string().optional().default(''),
      platforms: z.array(z.string()).optional().default([]),
      tags: z.array(z.string()).optional().default([]),
      stack: z.array(z.string()).optional().default([]),
      links: z.array(projectLink).optional().default([]),
      media: z.array(projectMedia).optional().default([]),
      metrics: z.array(z.object({
        label: z.string().optional().default(''),
        value: z.string().optional().default(''),
        source: z.string().optional().default(''),
      })).optional().default([]),
      featured: z.boolean().optional().default(false),
      archived: z.boolean().optional().default(false),
      archive: z.boolean().optional().default(false),
    })).min(1),
  }),
});

const link = z.object({
  label: z.string().optional().default(''),
  url: z.string().optional().default(''),
});

const cv = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './src/content/cv' }),
  schema: z.looseObject({
    name: z.string().optional().default(''),
    title: z.string().optional().default(''),
    summary: z.string().optional().default(''),
    contacts: z.array(link).optional().default([]),
    achievements: z.array(z.string()).optional().default([]),
    skills: z.array(z.object({
      group: z.string().optional().default(''),
      items: z.array(z.string()).optional().default([]),
    })).optional().default([]),
    experience: z.array(z.object({
      company: z.string().optional().default(''),
      role: z.string().optional().default(''),
      period: z.string().optional().default(''),
      description: z.array(z.string()).optional().default([]),
      stack: z.array(z.string()).optional().default([]),
    })).optional().default([]),
    education: z.array(z.object({
      institution: z.string().optional().default(''),
      degree: z.string().optional().default(''),
      period: z.string().optional().default(''),
    })).optional().default([]),
    languages: z.array(z.object({
      language: z.string().optional().default(''),
      level: z.string().optional().default(''),
    })).optional().default([]),
    location: z.string().optional().default(''),
    timezone: z.string().optional().default(''),
    work_permit: z.string().optional().default(''),
  }),
});

export const collections = { locales, pages, profiles, projects, cv };

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localeId = z.enum(['ru', 'en', 'es']);
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

const pageBase = {
  locale: localeId,
  status: z.enum(['draft', 'published']),
  title: z.string().min(1),
  description: z.string().min(1),
  eyebrow: z.string().min(1),
  heading: z.string().min(1),
  intro: z.string().min(1),
};

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/pages' }),
  schema: z.discriminatedUnion('route', [
    z.object({
      ...pageBase,
      route: z.literal('home'),
      headingAccent: z.string().min(1),
      heroPoints: z.array(z.string()).min(1),
      portrait: z.object({ src: z.string().min(1), alt: z.string().min(1), width: z.number(), height: z.number() }),
      evidence: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1),
      directions: z.array(z.object({
        route: z.enum(['experience', 'projects', 'learning', 'community']),
        label: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        action: z.string().min(1),
      })).length(4),
    }),
    z.object({
      ...pageBase,
      route: z.literal('experience'),
      profileLabel: z.string().min(1),
      achievementsLabel: z.string().min(1),
      skillsLabel: z.string().min(1),
      historyLabel: z.string().min(1),
      downloadsLabel: z.string().min(1),
      downloadNote: z.string().min(1),
    }),
    z.object({
      ...pageBase,
      route: z.literal('projects'),
      approachesLabel: z.string().min(1),
      selectedLabel: z.string().min(1),
      detailsLabel: z.string().min(1),
      backLabel: z.string().min(1),
    }),
    z.object({
      ...pageBase,
      route: z.literal('learning'),
      heroPoints: z.array(z.string()).min(1),
      primaryCta: z.string().min(1),
      examplesCta: z.string().min(1),
      comparisonLabel: z.string().min(1),
      comparisonHeading: z.string().min(1),
      comparison: z.array(z.object({ label: z.string(), title: z.string(), steps: z.array(z.string()).min(1) })).length(2),
      examplesLabel: z.string().min(1),
      examplesHeading: z.string().min(1),
      examplesIntro: z.string().min(1),
      scenarioGroups: z.array(z.object({
        label: z.string(),
        title: z.string(),
        items: z.array(z.object({ title: z.string(), description: z.string(), benefit: z.string() })).min(1),
      })).min(1),
      processLabel: z.string().min(1),
      processHeading: z.string().min(1),
      processIntro: z.string().min(1),
      process: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
      contactLabel: z.string().min(1),
      contactHeading: z.string().min(1),
      contactIntro: z.string().min(1),
      contactPoints: z.array(z.string()).min(1),
      safetyNote: z.string().min(1),
    }),
    z.object({
      ...pageBase,
      route: z.literal('community'),
      primaryCta: z.string().min(1),
      manifestoLabel: z.string().min(1),
      manifestoQuote: z.string().min(1),
      manifestoBody: z.string().min(1),
      principles: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
      ecosystemLabel: z.string().min(1),
      ecosystemHeading: z.string().min(1),
      products: z.array(z.object({ title: z.string(), description: z.string(), status: z.string() })).min(1),
      joinText: z.string().min(1),
      joinCta: z.string().min(1),
    }),
  ]),
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

const changelog = defineCollection({
  loader: glob({ pattern: '*.{yaml,yml}', base: './src/content/changelog' }),
  schema: z.object({
    changelog: z.array(z.object({
      version: z.string().min(1),
      date: z.string().min(1),
      changes: z.array(z.object({
        type: z.enum(['fixed', 'added', 'changed', 'removed']),
        text: z.string().min(1),
      })).min(1),
    })).min(1),
  }),
});

export const collections = { locales, pages, profiles, projects, cv, changelog };

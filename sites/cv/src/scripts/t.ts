//
//  t.ts
//  CV Hub
//
//  Created by Alexander Gusarov on 11.03.2026.
//  @spartan121
//
//  Usage: import { makeT } from '../scripts/t';
//  const t = makeT(translations, lang);
//  t('nav.home') → 'Home'
//

type Translations = Record<string, Record<string, string>>;
type TranslationSection = Record<string, Translations>;

export function makeT(data: TranslationSection, lang: string) {
  return function t(path: string): string {
    const [section, key] = path.split('.');
    return data?.[section]?.[key]?.[lang]
      ?? data?.[section]?.[key]?.['en']
      ?? path;
  };
}
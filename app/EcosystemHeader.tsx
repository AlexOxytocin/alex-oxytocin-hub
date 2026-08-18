import navConfig from "../shared/ecosystem-nav.json";
import Link from "next/link";

type Locale = "ru" | "en";
type Section = "home" | "experience" | "projects" | "training" | "community";

const labels = {
  ru: { nav: "Разделы экосистемы", language: "Выбор языка", brand: "Alex Oxytocin — на главную" },
  en: { nav: "Ecosystem sections", language: "Choose language", brand: "Alex Oxytocin — home" },
} as const;

export default function EcosystemHeader({ locale, active }: { locale: Locale; active: Section }) {
  const copy = labels[locale];

  return (
    <header className="ecosystem-header">
      <div className="ecosystem-nav__inner">
        <a className="ecosystem-nav__brand" href={locale === "en" ? "https://godmodetools.com/en/" : "https://godmodetools.com/"} aria-label={copy.brand}>
          <img className="brand-logo" src="/assets/alex-oxytocin-logo.png?v=official-master-20260817" alt="" width="216" height="30" />
        </a>
        <nav className="ecosystem-nav__links" aria-label={copy.nav}>
          {navConfig.sections.map((section) => (
            <a
              className="ecosystem-nav__link"
              href={section.hrefs[locale]}
              aria-current={section.id === active ? "page" : undefined}
              key={section.id}
            >
              {section.labels[locale]}
            </a>
          ))}
        </nav>
        <div className="ecosystem-nav__locale" aria-label={copy.language}>
          <Link href="/en/" lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</Link>
          <Link href="/" lang="ru" aria-current={locale === "ru" ? "page" : undefined}>RU</Link>
        </div>
      </div>
    </header>
  );
}

import EcosystemHeader from "./EcosystemHeader";

type Locale = "ru" | "en";

type Direction = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  action: string;
  accent: string;
  image?: { src: string; alt: string };
};

type HomeContent = {
  eyebrow: string;
  headline: { before: string; accent: string; after: string };
  portraitAlt: string;
  summary: string[];
  evidenceLabel: string;
  evidence: { value: string; label: string }[];
  directionsLabel: string;
  directions: Direction[];
  footer: string;
};

const content: Record<Locale, HomeContent> = {
  ru: {
    eyebrow: "Алексей Грищенко · архитектура · разработка · ИИ",
    headline: {
      before: "Разрабатываю",
      accent: "ИИ-инструменты",
      after: "и автоматизирую процессы.",
    },
    portraitAlt: "Алексей Грищенко",
    summary: [
      "Смотрю на задачу целиком — от идеи и архитектуры до внедрения и ежедневной работы.",
      "Индивидуально обучаю работе с ИИ на ваших задачах, чтобы дальше вы могли применять его самостоятельно.",
      "Развиваю «Алло, Нейросеточная?» — тёплое и безопасное ИТ-сообщество профессионалов для взаимопомощи, совместных проектов и встреч онлайн и офлайн.",
    ],
    evidenceLabel: "Опыт в цифрах",
    evidence: [
      { value: "20+", label: "лет в IT: от embedded и инфраструктуры до enterprise и AI" },
      { value: "10+", label: "лет в Java-разработке, техлидстве и архитектуре" },
      { value: "20+", label: "инженеров в командах, которые я вёл" },
      { value: "15 000+", label: "магазинов работали на системах, которые мы развивали" },
    ],
    directionsLabel: "Направления",
    directions: [
      {
        eyebrow: "Обучение",
        title: "Разобраться с ИИ",
        description: "Индивидуальное обучение работе с ИИ на ваших реальных задачах — без привязки к одному сервису.",
        href: "https://ai.godmodetools.com",
        action: "Перейти к обучению",
        accent: "cyan",
      },
      {
        eyebrow: "Решения и продукты",
        title: "Проекты и автоматизация",
        description: "Клиентские кейсы, собственные продукты и инженерные подходы — от RAG и агентов до Temporal и управляемой разработки.",
        href: "https://cv.godmodetools.com/showcase",
        action: "Смотреть проекты и подходы",
        accent: "violet",
      },
      {
        eyebrow: "Профессиональный профиль",
        title: "Опыт и резюме",
        description: "Архитектура, Java-разработка, AI Solutions и реализованные проекты — в формате, удобном для партнёров и команд.",
        href: "https://cv.godmodetools.com",
        action: "Открыть профиль",
        accent: "blue",
      },
      {
        eyebrow: "Комьюнити",
        title: "Алло, Нейросеточная?",
        description: "Сообщество практиков, боты и полезные инструменты вокруг реальной работы с ИИ.",
        href: "https://allo.godmodetools.com",
        action: "Зайти в комьюнити",
        accent: "magenta",
        image: { src: "/assets/community-mark.jpg", alt: "Логотип сообщества «Алло, Нейросеточная?»" },
      },
    ],
    footer: "Алексей Грищенко · AI Solutions Architect · Buenos Aires",
  },
  en: {
    eyebrow: "Aleksei Grishchenko · architecture · engineering · AI",
    headline: { before: "I build", accent: "AI tools", after: "and automate processes." },
    portraitAlt: "Aleksei Grishchenko",
    summary: [
      "I look at the whole problem — from the idea and architecture to implementation and day-to-day use.",
      "I teach people to use AI on their own real tasks, so they can keep applying it independently.",
      "I grow “Hello, Neural Network?” — a warm, safe community for IT professionals, built around mutual support, shared projects, and online and offline events.",
    ],
    evidenceLabel: "Experience in numbers",
    evidence: [
      { value: "20+", label: "years in IT: from embedded to enterprise and AI" },
      { value: "10+", label: "years in Java, tech leadership, and architecture" },
      { value: "20+", label: "engineers in teams I have led" },
      { value: "15,000+", label: "stores ran on systems my teams built" },
    ],
    directionsLabel: "Directions",
    directions: [
      {
        eyebrow: "Training",
        title: "Learn to work with AI",
        description: "One-to-one AI training built around your real tasks — without locking you into one service.",
        href: "https://ai.godmodetools.com",
        action: "Explore training",
        accent: "cyan",
      },
      {
        eyebrow: "Solutions and products",
        title: "Projects and automation",
        description: "Client work, original products, and engineering approaches — from RAG and agents to Temporal and managed development.",
        href: "https://cv.godmodetools.com/showcase/en",
        action: "Explore projects and approaches",
        accent: "violet",
      },
      {
        eyebrow: "Professional profile",
        title: "Experience and CV",
        description: "Architecture, Java development, AI solutions, and delivered projects — presented for partners and teams.",
        href: "https://cv.godmodetools.com/en",
        action: "View profile",
        accent: "blue",
      },
      {
        eyebrow: "Community",
        title: "Hello, Neural Network?",
        description: "A community of practitioners, bots, and useful tools built around real work with AI.",
        href: "https://allo.godmodetools.com",
        action: "Join the community",
        accent: "magenta",
        image: { src: "/assets/community-mark.jpg", alt: "Hello, Neural Network? community logo" },
      },
    ],
    footer: "Aleksei Grishchenko · AI Solutions Architect · Buenos Aires",
  },
};

export default function HomePage({ locale }: { locale: Locale }) {
  const copy = content[locale];
  const russian = content.ru;
  const isEnglish = locale === "en";

  return (
    <>
      <EcosystemHeader locale={locale} active="home" />
      <img className="community-network-art" src="/assets/community-network.png" alt="" width="2138" height="735" decoding="async" aria-hidden="true" />
      <main lang={locale}>
        <section className="hero" id="top">
        <div className="hero-primary-card">
        <div className="hero-copy-card">
          <div className={`hero-intro${isEnglish ? " locale-stack" : ""}`} id="about">
            <div className={isEnglish ? "locale-panel" : undefined}>
              <p className="eyebrow">{copy.eyebrow}</p>
              <h1>{copy.headline.before} <span className="hero-accent-tools">{copy.headline.accent}</span> {copy.headline.after}</h1>
            </div>
            {isEnglish && (
              <div className="locale-panel layout-reference" aria-hidden="true">
                <p className="eyebrow">{russian.eyebrow}</p>
                <h1>{russian.headline.before} <span className="hero-accent-tools">{russian.headline.accent}</span> {russian.headline.after}</h1>
              </div>
            )}
          </div>
          <div className={`hero-body${isEnglish ? " locale-stack" : ""}`}>
            <ul className={`hero-summary${isEnglish ? " locale-panel" : ""}`}>{copy.summary.map((item) => <li key={item}>{item}</li>)}</ul>
            {isEnglish && (
              <ul className="hero-summary locale-panel layout-reference" aria-hidden="true">
                {russian.summary.map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
          </div>
        </div>
        <figure className="hero-portrait">
          <img src="/assets/alexey-grishchenko-about-wide.png?v=portrait-outpaint-left-20260818" alt={copy.portraitAlt} width="1166" height="1349" decoding="async" />
        </figure>
        </div>
        <div className={`hero-evidence${isEnglish ? " locale-stack" : " evidence-grid"}`} aria-label={copy.evidenceLabel}>
          {isEnglish ? (
            <>
              <div className="evidence-grid locale-panel">
                {copy.evidence.map((item) => <div className="evidence-item" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
              </div>
              <div className="evidence-grid locale-panel layout-reference" aria-hidden="true">
                {russian.evidence.map((item) => <div className="evidence-item" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
              </div>
            </>
          ) : (
            copy.evidence.map((item) => <div className="evidence-item" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)
          )}
        </div>
        </section>

        <section className="directions" id="directions" aria-label={copy.directionsLabel}>
        <div className="direction-grid">
          {copy.directions.map((direction, index) => (
            <a className={`direction-card direction-card-${direction.accent}${direction.image ? " direction-card-with-mark" : ""}`} href={direction.href} key={direction.title}>
              {direction.image && <img className="direction-card-mark" src={direction.image.src} alt={direction.image.alt} width="96" height="96" loading="lazy" decoding="async" />}
              {isEnglish ? (
                <div className="direction-card-copy locale-stack">
                  <div className="direction-card-copy-panel locale-panel">
                    <span className="card-eyebrow">{direction.eyebrow}</span>
                    <h3>{direction.title}</h3>
                    <p>{direction.description}</p>
                    <span className="card-action">{direction.action} ↗</span>
                  </div>
                  <div className="direction-card-copy-panel locale-panel layout-reference" aria-hidden="true">
                    <span className="card-eyebrow">{russian.directions[index].eyebrow}</span>
                    <h3>{russian.directions[index].title}</h3>
                    <p>{russian.directions[index].description}</p>
                    <span className="card-action">{russian.directions[index].action} ↗</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="card-eyebrow">{direction.eyebrow}</span>
                  <h3>{direction.title}</h3>
                  <p>{direction.description}</p>
                  <span className="card-action">{direction.action} ↗</span>
                </>
              )}
            </a>
          ))}
        </div>
        </section>

        <footer className="about-strip">
        <p>{copy.footer}</p>
        <div className="footer-links">
          <a href="https://github.com/AlexOxytocin">GitHub</a>
          <a href="https://www.linkedin.com/in/aleksei-grishchenko/">LinkedIn</a>
          <a href="https://t.me/AlexOxytocin">Telegram</a>
        </div>
        </footer>
      </main>
    </>
  );
}

import { NeuralField } from "./NeuralField";

type Direction = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  action: string;
  accent: string;
  image?: { src: string; alt: string };
};

const directions: Direction[] = [
  {
    eyebrow: "Обучение",
    title: "ИИ по делу",
    description:
      "Индивидуальная работа с ИИ на ваших реальных задачах — без привязки к одному сервису.",
    href: "https://ai.godmodetools.com",
    action: "Перейти к обучению",
    accent: "cyan",
  },
  {
    eyebrow: "Решения",
    title: "ИИ и автоматизация",
    description:
      "Клиентские кейсы, собственные продукты и инженерные подходы — от RAG и агентов до Temporal и управляемой разработки.",
    href: "https://cv.godmodetools.com/showcase",
    action: "Смотреть проекты и подходы",
    accent: "violet",
  },
  {
    eyebrow: "Профессиональный профиль",
    title: "Опыт и роли",
    description:
      "Архитектура, Java-разработка, AI Solutions и реализованные проекты — в формате, удобном для партнёров и команд.",
    href: "https://cv.godmodetools.com",
    action: "Открыть профиль",
    accent: "blue",
  },
  {
    eyebrow: "Комьюнити и продукты",
    title: "Алло, Нейросеточная?",
    description:
      "Сообщество практиков, боты, полезные инструменты и веб-приложение вокруг реальной работы с ИИ.",
    href: "https://allo.godmodetools.com",
    action: "Зайти в комьюнити",
    accent: "magenta",
    image: {
      src: "/assets/community-mark.jpg",
      alt: "Логотип сообщества «Алло, Нейросеточная?»",
    },
  },
];

const evidence = [
  { value: "20+", label: "лет в IT: от embedded и инфраструктуры до enterprise и AI" },
  { value: "10+", label: "лет в Java-разработке, техлидстве и архитектуре" },
  { value: "20+", label: "инженеров в командах, которые я вёл" },
  { value: "15 000+", label: "магазинов работали на системах, которые мы развивали" },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Alex Oxytocin — на главную">
          <img
            className="brand-logo"
            src="/assets/alex-oxytocin-logo.svg"
            alt=""
            width="178"
            height="19"
          />
        </a>
        <nav aria-label="Основные разделы">
          <a href="#directions">Направления</a>
          <a href="#about">Обо мне</a>
          <a className="nav-contact" href="https://t.me/AlexOxitocin">
            Связаться
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <NeuralField />
        <div className="hero-copy">
          <p className="eyebrow">Алексей Грищенко · разработка · архитектура · ИИ</p>
          <h1>
            Собираю технологии
            <span> вокруг реальных дел.</span>
          </h1>
          <p className="hero-lead">
            Проектирую ИИ-решения, создаю инструменты и помогаю людям разобраться,
            как применять их в работе и жизни — осмысленно и под своим контролем.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#directions">
              Выбрать направление
            </a>
            <a className="text-link" href="https://t.me/AlexOxitocin">
              Написать в Telegram ↗
            </a>
          </div>
        </div>
      </section>

      <section className="directions" id="directions" aria-labelledby="directions-title">
        <div className="section-heading">
          <p className="eyebrow">Одна система · разные точки входа</p>
          <h2 id="directions-title">С чего начнём?</h2>
        </div>

        <div className="direction-grid">
          {directions.map((direction) => (
            <a
              className={`direction-card direction-card-${direction.accent}${direction.image ? " direction-card-with-mark" : ""}`}
              href={direction.href}
              key={direction.title}
            >
              {direction.image && (
                <img
                  className="direction-card-mark"
                  src={direction.image.src}
                  alt={direction.image.alt}
                  width="96"
                  height="96"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="card-eyebrow">{direction.eyebrow}</span>
              <h3>{direction.title}</h3>
              <p>{direction.description}</p>
              <span className="card-action">{direction.action} ↗</span>
            </a>
          ))}
        </div>
      </section>

      <section className="about" id="about" aria-labelledby="about-title">
        <div className="about-copy">
          <p className="eyebrow">Инженерный фундамент</p>
          <h2 id="about-title">Не продаю магию. Собираю системы.</h2>
          <p>
            Я Алексей Грищенко, AI Solutions Architect и бывший Senior Java
            Architect. Прошёл путь от C++ и инфраструктуры до enterprise-систем и
            агентных решений. Поэтому смотрю не только на эффектную демку, но и на
            то, как всё это будет жить после пятницы вечером.
          </p>
          <a className="text-link" href="https://cv.godmodetools.com">
            Посмотреть профессиональный профиль ↗
          </a>
        </div>
        <figure className="about-portrait">
          <img
            src="/assets/alexey-grishchenko-about.jpg?v=natural-warm"
            alt="Алексей Грищенко"
            width="1122"
            height="1402"
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="evidence-grid" aria-label="Опыт в цифрах">
          {evidence.map((item) => (
            <div className="evidence-item" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="about-strip">
        <p>Алексей Грищенко · AI Solutions Architect · Buenos Aires</p>
        <div className="footer-links">
          <a href="https://github.com/alexgoodman53">GitHub</a>
          <a href="https://www.linkedin.com/in/aleksei-grishchenko/">LinkedIn</a>
          <a href="https://t.me/AlexOxitocin">Telegram</a>
        </div>
      </footer>
    </main>
  );
}

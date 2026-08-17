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
    title: "Разобраться с ИИ",
    description:
      "Индивидуальная работа с ИИ на ваших реальных задачах — без привязки к одному сервису.",
    href: "https://ai.godmodetools.com",
    action: "Перейти к обучению",
    accent: "cyan",
  },
  {
    eyebrow: "Решения и продукты",
    title: "Проекты и автоматизация",
    description:
      "Клиентские кейсы, собственные продукты и инженерные подходы — от RAG и агентов до Temporal и управляемой разработки.",
    href: "https://cv.godmodetools.com/showcase",
    action: "Смотреть проекты и подходы",
    accent: "violet",
  },
  {
    eyebrow: "Профессиональный профиль",
    title: "Опыт и резюме",
    description:
      "Архитектура, Java-разработка, AI Solutions и реализованные проекты — в формате, удобном для партнёров и команд.",
    href: "https://cv.godmodetools.com",
    action: "Открыть профиль",
    accent: "blue",
  },
  {
    eyebrow: "Комьюнити",
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
          <a href="#about">Обо мне</a>
          <a href="#directions">Направления</a>
          <a className="nav-contact" href="https://t.me/AlexOxitocin">
            Связаться
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-intro" id="about">
          <p className="eyebrow">Алексей Грищенко · архитектура · разработка · ИИ</p>
          <h1>
            Разрабатываю <span className="hero-accent-tools">ИИ-инструменты</span> и
            автоматизирую процессы. Обучаю этому на{" "}
            <span className="hero-accent-task">ваших задачах</span>.
          </h1>
        </div>

        <figure className="hero-portrait">
          <img
            src="/assets/alexey-grishchenko-about.jpg?v=natural-warm"
            alt="Алексей Грищенко"
            width="1122"
            height="1402"
            decoding="async"
          />
        </figure>

        <div className="hero-body">
          <p>
            Создаю рабочие инструменты и автоматизацию на основе ИИ. Индивидуально
            помогаю осваивать их на реальных задачах.
          </p>
          <p>
            К ИИ я пришёл через разработку, инфраструктуру и архитектуру больших
            систем. Этот опыт научил меня смотреть не только на идею, но и на то,
            как решение работает каждый день. Мне важно, чтобы технологии были
            понятны людям, надёжны и не создавали новую ручную работу. Хороший
            инструмент освобождает время и внимание — в этом для меня весь смысл.
          </p>
          <p>
            Развиваю «Алло, Нейросеточная?» — тёплое и безопасное сообщество
            профессионалов с взаимопомощью, совместными проектами и встречами
            онлайн и офлайн.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="https://cv.godmodetools.com/showcase/">
              Посмотреть проекты
            </a>
            <a className="text-link" href="https://t.me/AlexOxitocin">
              Написать мне ↗
            </a>
          </div>
        </div>

        <div className="evidence-grid hero-evidence" aria-label="Опыт в цифрах">
          {evidence.map((item) => (
            <div className="evidence-item" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="directions" id="directions" aria-labelledby="directions-title">
        <div className="section-heading">
          <h2 id="directions-title">Проекты, опыт и работа с ИИ</h2>
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

      <footer className="about-strip">
        <p>Алексей Грищенко · AI Solutions Architect · Buenos Aires</p>
        <div className="footer-links">
          <a href="https://github.com/AlexOxytocin">GitHub</a>
          <a href="https://www.linkedin.com/in/aleksei-grishchenko/">LinkedIn</a>
          <a href="https://t.me/AlexOxitocin">Telegram</a>
        </div>
      </footer>
    </main>
  );
}

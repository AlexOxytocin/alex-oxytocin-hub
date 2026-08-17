import { NeuralField } from "./NeuralField";

const directions = [
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
      "Проектирование рабочих процессов, интеграций и инструментов, которыми можно управлять и которым можно доверять.",
    href: "#solutions",
    action: "Посмотреть направление",
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
  },
];

const evidence = [
  { value: "20+", label: "лет в IT: от embedded и инфраструктуры до enterprise и AI" },
  { value: "7+", label: "лет в Java-разработке, техлидстве и архитектуре" },
  { value: "10+", label: "инженеров в командах, которые я вёл" },
  { value: "15 000+", label: "магазинов работали на системах, которые мы развивали" },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Alex Oxytocin — на главную">
          <span>ALEX</span> <strong>OXYTOCIN</strong>
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
              className={`direction-card direction-card-${direction.accent}`}
              href={direction.href}
              key={direction.title}
            >
              <span className="card-eyebrow">{direction.eyebrow}</span>
              <h3>{direction.title}</h3>
              <p>{direction.description}</p>
              <span className="card-action">{direction.action} ↗</span>
            </a>
          ))}
        </div>
      </section>

      <section className="solutions" id="solutions" aria-labelledby="solutions-title">
        <div className="section-heading">
          <p className="eyebrow">От процесса до рабочего инструмента</p>
          <h2 id="solutions-title">Что я делаю для команд</h2>
        </div>
        <div className="solution-layout">
          <p className="solution-lead">
            Нахожу место, где ИИ действительно снимает ручную работу, проектирую
            решение и довожу его до управляемого продакшена — с интеграциями,
            проверками качества и человеком в контуре.
          </p>
          <ul className="solution-list">
            <li>Аудит процессов и карта возможностей автоматизации</li>
            <li>ИИ-агенты, RAG, MCP-интеграции и внутренние инструменты</li>
            <li>Прототип, оценка качества, внедрение и передача команде</li>
          </ul>
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
        <div className="evidence-grid" aria-label="Опыт в цифрах">
          {evidence.map((item) => (
            <div className="evidence-item" key={item.value}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="community-bridge" aria-labelledby="community-title">
        <div>
          <p className="eyebrow">Алло, Нейросеточная?</p>
          <h2 id="community-title">Технологии существуют внутри жизни, а не вместо неё.</h2>
        </div>
        <div className="community-copy">
          <p>
            Комьюнити практиков, где обсуждаем инструменты, собираем проекты,
            разбираем ошибки и делимся тем, что реально работает.
          </p>
          <a className="primary-button" href="https://allo.godmodetools.com">
            Открыть комьюнити
          </a>
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

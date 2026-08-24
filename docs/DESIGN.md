# God Mode Tools design system

## Направление

Система строится как тёмная редакционная инженерная среда: спокойный графитовый фон, один холодный signal-акцент для структуры и один тёплый акцент для редких смысловых моментов. Визуальный слой не изображает «AI-магичность» градиентом на каждом блоке; содержание, иерархия и состояние важнее декора.

## Референсы и выводы

- [Brittany Chiang](https://brittanychiang.com/) — понятная иерархия опыта, заметный skip link, аккуратная доступность и последовательные состояния ссылок. Берём дисциплину структуры, не копируем композицию.
- [Lee Robinson](https://leerob.com/) — компактная контентная подача, где дизайн не конкурирует с текстом. Берём низкий визуальный шум и читаемую плотность.
- [Rauno Freiberg](https://rauno.me/) — взаимодействие как часть ремесла и прямой принцип «fast / beautiful / consistent / careful». Берём сдержанный motion и внимание к состояниям.

## Токены

Машиночитаемая копия находится в `docs/design-tokens.json`; runtime custom properties — в `src/styles/tokens.css`. Семантические токены (`--surface-*`, `--text-*`, `--border-*`) изолируют компоненты от конкретной палитры. Новый редизайн в первую очередь меняет этот слой.

- spacing основан на 4px rhythm;
- touch target — не меньше 44px;
- display scale fluid через `clamp()`;
- focus использует отдельный контрастный цвет, не совпадающий с brand accent;
- радиусы ограничены тремя рабочими значениями, pill разрешён только для компактных controls.

## Компонентная модель

Primitives лежат в `src/components/ui/`: `Container`, `Section`, `Stack`, `Button`, `Card`. Композиционный `CTA`, общий `SiteHeader`, `SiteFooter` и `BaseLayout` используют только эти primitives и semantic tokens. Route/locale logic остаётся в `src/config/routes.ts`, поэтому дизайн-компоненты не собирают URL вручную.

## Motion contract

Motion подключается только через компоненты `src/components/motion/`. Страница без motion component не получает motion bundle. Любой эффект обязан направлять внимание, объяснять состояние или сохранять пространственную связь.

Обязательные gates:

- `prefers-reduced-motion` полностью отключает transforms и интерактивную сцену;
- low-end devices и viewport до 720px получают static fallback;
- запуск откладывается до idle time и только после попадания сцены в viewport;
- `visibilitychange`, уход из viewport и `pagehide` останавливают `requestAnimationFrame`;
- stage имеет заранее зарезервированный `aspect-ratio`, поэтому activation не создаёт layout shift;
- Canvas/SVG/WebGL считаются декоративными по умолчанию и не участвуют в accessibility tree.

React/motion runtime намеренно не добавлен: публичный сайт остаётся Astro static-first, а motion layer — framework-neutral opt-in island. Если позже появится сложный React island, он должен использовать те же tokens и gates, не заменяя их вторым motion API.

## Проверка

`npm run test:design` проверяет наличие primitives, централизованные tokens, reduced-motion/mobile/visibility gates, static fallback и то, что motion JavaScript попадает только на home shell. Визуальный reference доступен в `docs/design-preview.html` и не требует внешних зависимостей.

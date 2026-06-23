# Этап 6: UI, качество и выпуск — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести админку и публичные страницы к палитре PRD с прохождением WCAG AA, выстроить понятные состояния (пусто/ошибка/заблокировано) и закрыть продукт к выпуску (гейтинг dev-маршрутов, тесты edge-кейсов, инструкция).

**Architecture:** Вся палитра выносится в семантические CSS-переменные в `apps/web/src/styles.css` (единый источник правды), компоненты перекрашиваются через классы. Доступность (фокус, reduced-motion) добавляется глобально в том же файле. Серверная часть выпуска — гейтинг тестовых `/api/dev/*` маршрутов за env-флагом в `apps/api`.

**Tech Stack:** React 19 + React Router 7 + Vite (web), Hono + `node:sqlite` (api), vitest (тесты), Zod (валидация/конфиг).

## Global Constraints

- Весь интерфейс и пользовательские сообщения API — **только на русском языке**.
- TypeScript ESM: относительные импорты с явным расширением `.js`; типы — через `import type` (`verbatimModuleSyntax` включён).
- **Node 22+**. `packages/shared` потребляется как собранный `dist` — перед `typecheck`/`build`/`dev` в api/web выполнить `npm run build --workspace @queue-tracker/shared`.
- Все сочетания текста и фона — **минимум WCAG AA** (≥4.5:1 для обычного текста, ≥3:1 для крупного ≥18.66px bold / ≥24px).
- Палитра PRD (точные значения): бренд бирюза `#2BA8C9`, тёмно-синий `#14546A`, коралл `#F2785C`, успех `#3DAE6B`, в процессе `#5B9BD5`, предупреждение `#E0A33E`, текст `#2E3A40`, второстепенный `#6B7A82`, фон `#F5FAFB`, карточки `#FFFFFF`, границы `#E2EBEE`.
- Цветовая дисциплина (решения продукта): кнопки/ссылки — тёмно-синие; бирюза — шапка/фоны/активная точка/рамки; коралл — **один CTA на экран** (поиск «Найти», вход «Войти», список «Добавить ребёнка», карточка «Скопировать текст сообщения»). Иконка входа в админку остаётся коралловой.
- Состояния различаются **не только цветом** (значок + текст).
- Нельзя добавлять функции из раздела «Вне MVP» как обязательные.
- Коммиты — частые, по-русски в стиле репозитория (`feat(web): …`, `fix(api): …`, `docs: …`).
- Команды проверки: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

> **Известная правка под AA (требует подтверждения продукта перед Task 1):** коралл `#F2785C` с белым текстом даёт ~2.8:1 и НЕ проходит AA как заливка кнопки. В плане введён затемнённый оттенок `--color-accent-cta` (≈`#BE5038`, ≥4.5:1) для CTA-заливки, а исходный `#F2785C` остаётся для нетекстовых акцентов (иконка входа, тонкие акценты). Если продукт хочет ровно `#F2785C` на кнопках — тогда CTA становятся тёмно-синими, а коралл уходит только в нетекстовый акцент. По умолчанию план реализует первый вариант.

---

## File Structure

**Изменяемые файлы (web):**
- `apps/web/src/styles.css` — токены палитры, перекраска кнопок/ссылок, focus-visible, reduced-motion, стили таймлайна/состояний/пустых блоков, компактная шапка статуса. Главный файл этапа.
- `apps/web/src/components/StatusCard.tsx` — таймлайн по состоянию + значки состояний + блок «Зачислен».
- `apps/web/src/pages/SearchPage.tsx` — блок-результат «не найдено»/«заблокировано».
- `apps/web/src/pages/StatusPage.tsx` — модификатор компактной шапки.
- `apps/web/src/pages/AdminListPage.tsx` — перекраска фильтра «Найти», улучшенные пустые состояния.
- `apps/web/src/pages/AdminChildPage.tsx` — перекраска кнопок (Save/Next → primary, копирование текста → accent).

**Изменяемые файлы (api):**
- `apps/api/src/config.ts` — флаг `ENABLE_DEV_ROUTES` + сброс кэша конфига для тестов.
- `apps/api/src/app.ts` — условный монтаж dev-маршрутов.
- `apps/api/src/routes/public.ts` — копирайт сообщения блокировки.
- `apps/api/.env.example` (корневой `.env.example`) — документировать флаг.

**Создаваемые файлы:**
- `apps/api/test/dev-routes.test.ts` — тест гейтинга dev-маршрутов.
- `docs/RELEASE_CHECKLIST.md` — ручной чек-лист приёмки MVP.

**Не трогаем (уже корректно):** `apps/api/test/children.test.ts` уже покрывает edge-кейсы PRD (повторный ИИН после архива; недоступность архива по токену и ИИН; зачисленный без номеров очереди; безопасный generic-ответ). Эти тесты — основа ручного чек-листа, дублировать их не нужно.

---

### Task 1: Семантические токены палитры, перекраска действий и глобальная доступность

**Files:**
- Modify: `apps/web/src/styles.css` (`:root` блок строки 1-10; группы кнопок строки 141-202; добавить новые правила)
- Modify: `apps/web/src/pages/AdminListPage.tsx:150` (кнопка фильтра «Найти»)
- Modify: `apps/web/src/pages/AdminChildPage.tsx:452,478,547` (классы кнопок)

**Interfaces:**
- Produces: CSS-переменные `--color-primary`, `--color-accent-cta`, `--color-brand`, `--color-success`, `--color-in-progress`, `--color-enrolled`, `--color-warning*`, `--color-danger`, `--color-text`, `--color-text-muted`, `--color-bg`, `--color-surface`, `--color-border`, `--color-focus`, `--radius`; CSS-классы `.primary-button` (тёмно-синяя заливка), `.accent-button` (коралловый CTA), `.ghost-button` (вторичная). Используются во всех последующих web-задачах.

- [x] **Step 1: Добавить семантические токены в `:root`**

В `apps/web/src/styles.css` в начало `:root` (перед `font-family`) добавить блок переменных:

```css
:root {
  --color-brand: #2ba8c9;          /* бирюза: шапка, фоновые акценты, активная точка, рамки */
  --color-primary: #14546a;        /* тёмно-синий: кнопки, ссылки, заголовки (8.4:1 на белом) */
  --color-primary-hover: #0e3f50;
  --color-accent: #f2785c;         /* коралл PRD: нетекстовые акценты (иконка входа) */
  --color-accent-cta: #be5038;     /* затемнённый коралл для CTA-заливки + белый текст (≥4.5:1) */
  --color-accent-cta-hover: #a7442f;
  --color-success: #3dae6b;        /* пройденный этап */
  --color-in-progress: #5b9bd5;    /* текущий этап */
  --color-enrolled: #2ba8c9;       /* финал «Зачислен» */
  --color-warning-ink: #8a5a12;    /* текст предупреждения на белом — подобрать ≥4.5:1 */
  --color-warning-surface: #fbf1dc;/* фон янтарного блока */
  --color-warning-accent: #e0a33e; /* иконка/рамка предупреждения (PRD янтарный, крупн.) */
  --color-danger: #b3503c;         /* техническая ошибка */
  --color-text: #2e3a40;           /* основной текст (~11:1 на белом) */
  --color-text-muted: #566a72;     /* второстепенный — подобрать ≥4.5:1 на белом */
  --color-bg: #f5fafb;
  --color-surface: #ffffff;
  --color-border: #e2ebee;
  --color-focus: #14546a;
  --radius: 8px;
  /* существующие свойства ниже без изменений */
  font-family: "Manrope", "Segoe UI", sans-serif;
  color: var(--color-text);
  /* ... */
}
```

Заменить жёсткий `color: #173847;` на `color: var(--color-text);`.

- [x] **Step 2: Ввести `.primary-button` и развести цвета кнопок**

Заменить общую группу кнопок (текущие строки ~141-185, где всё коралловое) так, чтобы базовая форма была общей, а заливки — разными. Целевые правила:

```css
.search-form button,
.accent-button,
.primary-button,
.ghost-button,
.admin-filters button {
  min-height: 52px;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

/* Коралловый CTA: «Найти», «Войти», «Добавить ребёнка», «Скопировать текст сообщения» */
.search-form button,
.accent-button {
  background: var(--color-accent-cta);
  color: #fff;
  box-shadow: 0 12px 24px rgba(190, 80, 56, 0.22);
}
.search-form button:hover,
.accent-button:hover {
  background: var(--color-accent-cta-hover);
  transform: translateY(-1px);
}

/* Тёмно-синяя первичная: «Сохранить», «Перевести в…», фильтр «Найти» */
.primary-button,
.admin-filters button {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 12px 24px rgba(20, 84, 106, 0.18);
}
.primary-button:hover,
.admin-filters button:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
}

.search-form button:disabled,
.accent-button:disabled,
.primary-button:disabled,
.admin-filters button:disabled {
  opacity: 0.7;
  cursor: progress;
  transform: none;
}
```

Сохранить существующие `.accent-button, .ghost-button { display:inline-flex; … }` и `.ghost-button`-правила; добавить `.primary-button` в селекторы выравнивания там, где есть `.accent-button` (строки ~171-178), чтобы кнопка-ссылка и submit выглядели одинаково.

- [x] **Step 3: Перекрасить компонентные кнопки под дисциплину «один коралл на экран»**

В `apps/web/src/pages/AdminChildPage.tsx`:
- строка 452: `className="accent-button"` → `className="primary-button"` (Сохранить/Создать).
- строка 478: `className="accent-button"` → `className="primary-button"` (Перевести в…).
- строка 547: `className="ghost-button"` → `className="accent-button"` (Скопировать текст сообщения — единственный коралл карточки).

В `apps/web/src/pages/AdminListPage.tsx`:
- строка 150: `<button type="submit">Найти</button>` остаётся как есть — он внутри `.admin-filters` и теперь красится тёмно-синим автоматически. «Добавить ребёнка» (`.accent-button`, строка 123) остаётся коралловым CTA.

- [x] **Step 4: Добавить глобальную видимую обводку фокуса**

В `apps/web/src/styles.css` добавить:

```css
:where(a, button, input, select, textarea, [role="tab"]):focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius);
}
```

- [x] **Step 5: Добавить поддержку reduced-motion**

В `apps/web/src/styles.css` добавить в конец:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .timeline-item--current .timeline-dot {
    box-shadow: none;
  }
}
```

- [x] **Step 6: Собрать shared и проверить web**

Run:
```bash
npm run build --workspace @queue-tracker/shared
npm run typecheck --workspace @queue-tracker/web
npm run lint --workspace @queue-tracker/web
```
Expected: PASS без ошибок.

- [x] **Step 7: Визуально проверить контраст (acceptance)**

Run: `npm run dev:web` и открыть `/search`, `/admin/login`, `/admin`, карточку ребёнка.
Проверить инструментом контраста (DevTools / WebAIM) пары: белый текст на `.accent-button` и `.primary-button` ≥4.5:1; `--color-text-muted` и `--color-warning-ink` на белом ≥4.5:1 (подкрутить токен, если ниже); фокусная обводка видна при Tab.
Expected: все пары ≥4.5:1, обводка фокуса видна на каждом интерактивном элементе.

- [x] **Step 8: Commit**

```bash
git add apps/web/src/styles.css apps/web/src/pages/AdminChildPage.tsx apps/web/src/pages/AdminListPage.tsx
git commit -m "feat(web): семантические токены палитры, AA-перекраска кнопок и фокус/анимация"
```

---

### Task 2: Таймлайн статуса по состоянию + значки состояний + блок «Зачислен»

**Files:**
- Modify: `apps/web/src/components/StatusCard.tsx`
- Modify: `apps/web/src/styles.css` (правила `.timeline*`, новый блок `.enrolled-banner`)

**Interfaces:**
- Consumes: `childStatusValues`, `childStatusLabels`, `PublicStatusView` из `@queue-tracker/shared`; токены из Task 1.
- Produces: визуальные состояния `done`/`current`/`todo` с иконкой + блок «Зачислен» (используются только здесь).

- [x] **Step 1: Добавить значки состояний (SVG) в таймлайн**

В `apps/web/src/components/StatusCard.tsx` заменить разметку пункта таймлайна так, чтобы вместо одной `.timeline-dot` рисовался значок по состоянию (галочка для `done`, кольцо для `current`, пустой кружок для `todo`). Внутри `.map` заменить тело `<li>`:

```tsx
<li key={value} className={`timeline-item timeline-item--${state}`}>
  <span className="timeline-marker" aria-hidden="true">
    {state === "done" ? (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    ) : null}
  </span>
  <span>{childStatusLabels[value]}</span>
  <span className="timeline-state-label">
    {state === "done" ? "Пройдено" : state === "current" ? "Сейчас" : "Ожидается"}
  </span>
</li>
```

(Текстовая подпись `timeline-state-label` обеспечивает «не только цветом».)

- [x] **Step 2: Добавить блок «Зачислен»**

В `StatusCard.tsx` перед `<ol className="timeline">` добавить условный баннер, когда `status.status === "enrolled"`:

```tsx
{status.status === "enrolled" ? (
  <div className="enrolled-banner" role="status">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4 4 10-11" />
    </svg>
    <div>
      <strong>Ребёнок зачислен</strong>
      <p>Поздравляем! Заявка дошла до финального этапа.</p>
    </div>
  </div>
) : null}
```

- [x] **Step 3: Стилизовать таймлайн и баннер**

В `apps/web/src/styles.css` заменить блок `.timeline-dot`/состояний и добавить новые правила:

```css
.timeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
}
.timeline-marker {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex: 0 0 auto;
}
.timeline-item--done .timeline-marker {
  background: var(--color-success);
  border-color: var(--color-success);
}
.timeline-item--current .timeline-marker {
  background: var(--color-in-progress);
  border-color: var(--color-in-progress);
}
.timeline-item--current { color: var(--color-text); font-weight: 600; }
.timeline-state-label {
  margin-left: auto;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.enrolled-banner {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 0 0 20px;
  padding: 18px 20px;
  border-radius: var(--radius);
  background: linear-gradient(135deg, rgba(43, 168, 201, 0.16), rgba(43, 168, 201, 0.06));
  border: 1px solid var(--color-enrolled);
  color: var(--color-primary);
}
.enrolled-banner svg { color: var(--color-enrolled); flex: 0 0 auto; }
.enrolled-banner strong { display: block; }
.enrolled-banner p { margin: 4px 0 0; color: var(--color-text); }
```

Удалить старые `.timeline-dot`, `.timeline-item--done .timeline-dot`, `.timeline-item--current .timeline-dot`.

- [x] **Step 4: Проверить**

Run: `npm run typecheck --workspace @queue-tracker/web && npm run lint --workspace @queue-tracker/web`
Затем `npm run dev` и открыть `/status/<token>` для ребёнка на разных этапах и зачисленного (можно через `npm run setup:employee` + админку завести данные, или сид).
Expected: пройденные этапы — зелёная галочка + «Пройдено»; текущий — синее кольцо + «Сейчас»; будущие — серый кружок + «Ожидается»; у зачисленного — бирюзовый баннер и нет блока номера очереди.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/StatusCard.tsx apps/web/src/styles.css
git commit -m "feat(web): таймлайн статуса по состоянию со значками и блок «Зачислен»"
```

---

### Task 3: Состояния поиска (блок-результат) + копирайт блокировки

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/styles.css` (блок `.result-block`)
- Modify: `apps/api/src/routes/public.ts:49` (текст сообщения блокировки)

**Interfaces:**
- Consumes: `searchStatusByIin`, `ApiRequestError` из `../lib/api.js`; токены Task 1.
- Produces: UI-состояния поиска (только здесь).

- [x] **Step 1: Поправить копирайт сообщения блокировки в API**

В `apps/api/src/routes/public.ts` строка 49 заменить «из СМС» на «из сообщения»:

```ts
message: `Слишком много попыток поиска. Попробуйте через ~${minutes} мин. или откройте персональную ссылку из сообщения.`
```

(Тест `public-search-rate-limit.test.ts` проверяет подстроку «персональную ссылку» — она сохраняется, тест не ломается.)

- [x] **Step 2: Различать тип результата в SearchPage**

В `apps/web/src/pages/SearchPage.tsx` заменить единое строковое `message` на типизированное состояние. Импортировать `ApiRequestError`. Внутри компонента:

```tsx
type SearchResult =
  | { kind: "idle" }
  | { kind: "notFound" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

const [result, setResult] = useState<SearchResult>({ kind: "idle" });
```

В `handleSubmit` заменить `catch`:

```tsx
} catch (error) {
  if (error instanceof ApiRequestError && error.status === 404) {
    setResult({ kind: "notFound" });
  } else if (error instanceof ApiRequestError && error.status === 429) {
    setResult({ kind: "blocked", message: error.message });
  } else if (error instanceof ApiRequestError && error.status === 400) {
    setResult({ kind: "error", message: error.message });
  } else {
    setResult({ kind: "error", message: "Не удалось выполнить поиск. Проверьте интернет и попробуйте снова." });
  }
} finally {
  setIsLoading(false);
}
```

В начале `handleSubmit` заменить `setMessage(null)` на `setResult({ kind: "idle" })`.

- [x] **Step 3: Отрисовать блок-результат**

Заменить строку `<p className={\`message…\`}>` на условный блок после `</form>`:

```tsx
{result.kind === "notFound" ? (
  <div className="result-block result-block--warning" role="status">
    <ResultIcon kind="warning" />
    <div>
      <strong>Заявка не найдена</strong>
      <p>Проверьте ИИН ребёнка. Если он верный, заявки с таким ИИН в системе нет.</p>
    </div>
  </div>
) : result.kind === "blocked" ? (
  <div className="result-block result-block--warning" role="status">
    <ResultIcon kind="warning" />
    <div>
      <strong>Поиск временно ограничен</strong>
      <p>{result.message}</p>
    </div>
  </div>
) : result.kind === "error" ? (
  <div className="result-block result-block--danger" role="alert">
    <ResultIcon kind="danger" />
    <div>
      <strong>Не удалось выполнить поиск</strong>
      <p>{result.message}</p>
    </div>
  </div>
) : null}
```

Добавить вспомогательный компонент `ResultIcon` в этом же файле (треугольник для warning, круг с «!» для danger), оба `aria-hidden`:

```tsx
function ResultIcon({ kind }: { kind: "warning" | "danger" }) {
  return (
    <svg className={`result-icon result-icon--${kind}`} viewBox="0 0 24 24" width="24" height="24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "warning" ? <path d="M12 4L3 19h18L12 4zM12 10v4M12 17v.5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.5" /></>}
    </svg>
  );
}
```

- [x] **Step 4: Стилизовать блок-результат**

В `apps/web/src/styles.css` добавить:

```css
.result-block {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
}
.result-block strong { display: block; color: var(--color-text); }
.result-block p { margin: 4px 0 0; color: var(--color-text); }
.result-block--warning {
  background: var(--color-warning-surface);
  border-color: var(--color-warning-accent);
}
.result-icon--warning { color: var(--color-warning-accent); flex: 0 0 auto; }
.result-block--danger {
  background: rgba(179, 80, 60, 0.08);
  border-color: var(--color-danger);
}
.result-icon--danger { color: var(--color-danger); flex: 0 0 auto; }
```

(Текст пояснения — тёмный `--color-text`, поэтому янтарный нужен только AA-крупный для иконки/рамки.)

- [x] **Step 5: Проверить**

Run: `npm run lint --workspace @queue-tracker/api && npm run test --workspace @queue-tracker/api -- public-search-rate-limit.test.ts`
Expected: PASS (копирайт-правка не сломала тест).
Run: `npm run typecheck --workspace @queue-tracker/web && npm run lint --workspace @queue-tracker/web`, затем вручную на `/search`: несуществующий ИИН → янтарный блок «Заявка не найдена»; 6 попыток → янтарный блок «Поиск временно ограничен» с «~N мин».
Expected: блоки отображаются, кнопка остаётся активной.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/pages/SearchPage.tsx apps/web/src/styles.css apps/api/src/routes/public.ts
git commit -m "feat(web): блок-результат для поиска (не найдено/заблокировано) и нейтральный копирайт"
```

---

### Task 4: Пустые состояния админки + компактная шапка статуса на мобиле

**Files:**
- Modify: `apps/web/src/pages/AdminListPage.tsx:161-170` (разделить «нет данных» и «не найдено»)
- Modify: `apps/web/src/pages/StatusPage.tsx:58` (модификатор шапки)
- Modify: `apps/web/src/styles.css` (`.hero--compact`, `.empty-state`)

**Interfaces:**
- Consumes: `items`, `query`, `status`, `mode` из существующего состояния `AdminListPage`; токены Task 1.
- Produces: классы `.hero--compact`, `.empty-state` (используются только здесь).

- [x] **Step 1: Разделить пустые состояния списка**

В `apps/web/src/pages/AdminListPage.tsx` заменить единый блок `items.length === 0` (строки ~166-170) на различение «фильтр пуст» vs «детей нет»:

```tsx
) : items.length === 0 ? (
  <section className="panel empty-state">
    {query || status ? (
      <>
        <h2>Ничего не найдено</h2>
        <p>Проверьте ФИО, ИИН или телефон и измените фильтр.</p>
      </>
    ) : (
      <>
        <h2>В очереди пока нет детей</h2>
        <p>Добавьте первого ребёнка, чтобы начать вести очередь.</p>
        <Link className="accent-button" to="/admin/children/new">Добавить ребёнка</Link>
      </>
    )}
  </section>
) : (
```

(`Link` уже импортирован в файле.)

- [x] **Step 2: Компактная шапка на странице статуса**

В `apps/web/src/pages/StatusPage.tsx` строка 58 заменить `<section className="hero">` на `<section className="hero hero--compact">`.

- [x] **Step 3: Стили компактной шапки и пустого блока**

В `apps/web/src/styles.css` добавить:

```css
.hero--compact {
  padding: 22px 28px;
}
.hero--compact h1 {
  font-size: clamp(1.5rem, 4vw, 2.2rem);
}
.empty-state {
  display: grid;
  gap: 10px;
  justify-items: start;
}
@media (max-width: 720px) {
  .hero--compact {
    padding: 18px;
  }
}
```

- [x] **Step 4: Проверить**

Run: `npm run typecheck --workspace @queue-tracker/web && npm run lint --workspace @queue-tracker/web`, затем вручную:
- `/admin` с пустой БД → блок «В очереди пока нет детей» + коралловая кнопка «Добавить ребёнка»; с фильтром без совпадений → «Ничего не найдено».
- `/status/<token>` в узком окне (375px, DevTools) → карточка статуса с номером видна почти сразу, нет горизонтальной прокрутки.
Expected: соответствует описанию; ширина не превышает вьюпорт.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/pages/AdminListPage.tsx apps/web/src/pages/StatusPage.tsx apps/web/src/styles.css
git commit -m "feat(web): пустые состояния админки и компактная шапка статуса на мобиле"
```

---

### Task 5: Гейтинг dev-маршрутов за `ENABLE_DEV_ROUTES` (TDD)

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/app.ts:34`
- Modify: `.env.example` (корень репозитория)
- Create: `apps/api/test/dev-routes.test.ts`

**Interfaces:**
- Consumes: `createApp(db)`, `bootstrapDatabase`, `createDb` (как в существующих тестах).
- Produces: `getConfig().ENABLE_DEV_ROUTES: boolean`; `resetConfigCache(): void` (экспорт из `config.ts`, для тестов).

- [x] **Step 1: Написать падающий тест**

Создать `apps/api/test/dev-routes.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { resetConfigCache } from "../src/config.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";

const childBody = JSON.stringify({
  fullName: "Тест",
  iin: "123456789012",
  parentPhone: "+77010000000"
});

describe("dev routes gating", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    process.env.PUBLIC_APP_URL = "http://localhost:5173";
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    bootstrapDatabase(sqlite);
    db = createDb(sqlite);
  });

  afterEach(() => {
    delete process.env.ENABLE_DEV_ROUTES;
    resetConfigCache();
  });

  it("returns 404 for dev routes when the flag is unset", async () => {
    delete process.env.ENABLE_DEV_ROUTES;
    resetConfigCache();
    const app = createApp(db);
    const res = await app.request("/api/dev/children", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: childBody
    });
    expect(res.status).toBe(404);
  });

  it("mounts dev routes when ENABLE_DEV_ROUTES=true", async () => {
    process.env.ENABLE_DEV_ROUTES = "true";
    resetConfigCache();
    const app = createApp(db);
    const res = await app.request("/api/dev/children", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: childBody
    });
    expect(res.status).toBe(201);
  });
});
```

- [x] **Step 2: Запустить тест — убедиться, что падает**

Run: `npm run test --workspace @queue-tracker/api -- dev-routes.test.ts`
Expected: FAIL — `resetConfigCache` не экспортирован и dev-маршруты смонтированы всегда (первый тест получает 201 вместо 404).

- [x] **Step 3: Добавить флаг и сброс кэша в config.ts**

В `apps/api/src/config.ts` добавить поле в `envSchema` (после `SESSION_COOKIE_NAME`):

```ts
SESSION_COOKIE_NAME: z.string().min(1).default("queue_admin_session"),
ENABLE_DEV_ROUTES: z
  .string()
  .optional()
  .transform((value) => value === "true")
```

И экспортировать сброс кэша после `getConfig`:

```ts
export function resetConfigCache(): void {
  cachedConfig = undefined;
}
```

- [x] **Step 4: Сделать монтаж dev-маршрутов условным**

В `apps/api/src/app.ts` заменить строку 34 `registerDevRoutes(app, db);` на:

```ts
if (config.ENABLE_DEV_ROUTES) {
  registerDevRoutes(app, db);
}
```

(`config` уже получен на строке 15 через `getConfig()`.)

- [x] **Step 5: Запустить тест — убедиться, что проходит**

Run: `npm run test --workspace @queue-tracker/api -- dev-routes.test.ts`
Expected: PASS (оба кейса).

- [x] **Step 6: Прогнать весь тест-сьют (нет регрессий)**

Run: `npm run test --workspace @queue-tracker/api`
Expected: PASS — существующие тесты не зависят от dev-маршрутов.

- [x] **Step 7: Документировать флаг в `.env.example`**

В корневой `.env.example` добавить строку:

```
ENABLE_DEV_ROUTES=false
```

- [x] **Step 8: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/app.ts apps/api/test/dev-routes.test.ts .env.example
git commit -m "feat(api): гейтинг dev-маршрутов за ENABLE_DEV_ROUTES (выкл. по умолчанию)"
```

---

### Task 6: Документы выпуска — чек-лист приёмки и раздел «Выпуск» в README

**Files:**
- Create: `docs/RELEASE_CHECKLIST.md`
- Modify: `README.md` (добавить раздел «Выпуск и эксплуатация»)

**Interfaces:** нет (документация).

- [x] **Step 1: Создать ручной чек-лист приёмки**

Создать `docs/RELEASE_CHECKLIST.md` — сценарии end-to-end на русском, по Acceptance Criteria задачи 012:

```markdown
# Чек-лист приёмки MVP

Часть сценариев покрыта автотестами (`apps/api/test/`); ниже — ручная приёмка UI и сквозных потоков.

## Сотрудник
- [ ] Вход в админку по логину и паролю (созданному через `setup:employee`).
- [ ] Добавление ребёнка (ФИО, ИИН 12 цифр, телефон, опц. срок) → появляется в списке.
- [ ] Смена статуса вперёд на один шаг; откат назад с подтверждением.
- [ ] Зачисление: подтверждение, ребёнок уходит из активной очереди, остальные продвигаются.
- [ ] Копирование персональной ссылки и готового текста сообщения.
- [ ] История действий (вкладка «История») содержит ключевые действия.

## Родитель
- [ ] Персональная ссылка открывается без входа, показывает этапы, номер, число семей, срок.
- [ ] Поиск по ИИН ведёт на ту же страницу статуса.
- [ ] Несуществующий ИИН → «Заявка не найдена» без подробностей.
- [ ] 6-я попытка поиска за 15 минут → блок «Поиск временно ограничен» (~N мин).
- [ ] Зачисленный ребёнок: финальный бирюзовый блок, без номера очереди.

## Приватность и безопасность
- [ ] Архивированная запись недоступна и по ссылке, и по поиску (одинаковый generic-ответ).
- [ ] Повторное добавление того же ИИН после архива создаёт новую запись; старая ссылка мертва.
- [ ] В проде `ENABLE_DEV_ROUTES` не выставлен → `POST /api/dev/children` → 404.
- [ ] Сообщения об ошибках не содержат ФИО/телефон/ИИН других семей.

## Доступность
- [ ] Все интерактивные элементы имеют видимую обводку фокуса (Tab).
- [ ] Статус читаем при включённом «уменьшить движение».
- [ ] Страница статуса на 375px — без горизонтальной прокрутки.
```

- [x] **Step 2: Добавить раздел «Выпуск и эксплуатация» в README**

В `README.md` после раздела «Переменные окружения» добавить:

```markdown
## Выпуск и эксплуатация

- **Продакшн-сборка:** `npm run build` (порядок shared → api → web).
- **Запуск API:** Node 22+, переменные окружения из таблицы выше; `SESSION_SECRET` ≥32 символов обязателен.
- **Dev-маршруты:** `/api/dev/*` — тестовые помощники без авторизации. В проде **не выставляйте** `ENABLE_DEV_ROUTES`; по умолчанию они отключены.
- **Бэкап данных:** состояние хранится в одном файле SQLite (`DATABASE_URL`, по умолчанию `./data/app.db`) — включите его в регулярный бэкап.
- **Создание сотрудников:** только через `npm run setup:employee` (публичной регистрации нет).
- **Приёмка перед релизом:** пройдите [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).
```

- [x] **Step 3: Commit**

```bash
git add docs/RELEASE_CHECKLIST.md README.md
git commit -m "docs: чек-лист приёмки MVP и раздел выпуска в README"
```

---

## Self-Review

**Spec coverage (задача 011):** палитра-токены + основной цвет `#2BA8C9`/тёмный текст (Task 1) ✓; статусы согласованными цветами (Task 2) ✓; публичные страницы на мобильном без горизонтальной прокрутки (Task 4 Step 4) ✓; пустые/ошибочные/заблокированные состояния (Task 3, Task 4) ✓; контраст основных состояний AA (Task 1 Step 7) ✓; ошибки/пустые на русском (Task 3, Task 4) ✓.

**Spec coverage (задача 012):** end-to-end и edge-кейсы — существующие тесты + чек-лист (Task 6) ✓; недоступность удалённых записей (существующий `children.test.ts` + чек-лист) ✓; зачисленный без номера очереди (Task 2 + существующий тест) ✓; копирование ссылки/текста (чек-лист) ✓; rate-limit (существующий тест + чек-лист) ✓; dev-маршруты не в проде (Task 5) ✓; инструкция (Task 6) ✓; ошибки не раскрывают ПДн (существующий generic-тест + чек-лист) ✓.

**Placeholder scan:** код приведён во всех шагах; токены `--color-warning-ink` и `--color-text-muted` помечены «подобрать ≥4.5:1» с обязательной проверкой в Task 1 Step 7 — это явная acceptance-проверка, а не заглушка.

**Type consistency:** `ENABLE_DEV_ROUTES` (boolean после transform) и `resetConfigCache()` определены в Task 5 Step 3 и используются в Task 5 Step 1/4 согласованно. Классы `.primary-button`/`.accent-button`/`.ghost-button` определены в Task 1 и переиспользуются в Task 2-4 без переименований. `SearchResult` тип локален для Task 3.

**Открытый вопрос для продукта:** затемнённый коралл `--color-accent-cta` (см. Global Constraints). Если продукт настаивает на точном `#F2785C`, заменить в Task 1 Step 2 заливку `.accent-button` на `--color-primary` (тёмно-синий), а коралл оставить только для иконки входа — остальной план не меняется.
```

# Трекер статуса очереди центра

Система электронного информирования родителей о продвижении очереди в детском
центре. Сотрудники ведут единую FIFO-очередь детей в закрытой админке; родители
смотрят статус своего ребёнка (этап, номер в очереди, число семей впереди) на
публичной странице — по персональной ссылке или по поиску по ИИН.

Весь продукт, интерфейс и пользовательские сообщения API — **на русском языке**.

- Продуктовая спецификация: [PRD.md](./PRD.md)
- План работ по этапам: [TASKS.md](./TASKS.md)
- Руководство для ИИ-ассистентов и архитектурные соглашения: [CLAUDE.md](./CLAUDE.md)

## Стек

- **Монорепозиторий** на npm workspaces
- **`packages/shared`** — Zod-схемы, типы, enum статусов и русские подписи,
  нормализация/валидация ИИН и телефонов (единый источник правды для API и веба)
- **`apps/api`** — Hono на `@hono/node-server`, хранилище — нативный `node:sqlite`
- **`apps/web`** — React 19 + React Router 7, сборка Vite

## Требования

- **Node 22+** — API использует нативный модуль `node:sqlite`

## Быстрый старт

```bash
npm install                 # установить все воркспейсы
cp .env.example .env        # создать конфиг (см. переменные ниже)

# shared собирается в dist и потребляется как пакет — собрать его первым
npm run build --workspace @queue-tracker/shared

# создать сотрудника для входа в админку (публичной регистрации нет)
npm run setup:employee --workspace @queue-tracker/api -- \
  --login admin --name "Администратор" --password "secret"

npm run dev                 # API на :3001 + веб на :5173
```

После запуска:

- админка — http://localhost:5173/admin (вход — http://localhost:5173/admin/login,
  также доступен по иконке-шестерёнке в правом верхнем углу публичных страниц)
- публичный поиск по ИИН — http://localhost:5173/search
- персональная страница статуса — http://localhost:5173/status/:token

> Скрипты `dev` и `setup:employee` в `apps/api` подхватывают корневой `.env`
> автоматически через нативный флаг Node `--env-file`, поэтому достаточно один раз
> скопировать `.env.example` в `.env`.

## Команды

```bash
npm run dev                 # API (:3001) + веб (:5173) одновременно
npm run dev:api             # только API (tsx watch)
npm run dev:web             # только веб (vite)

npm run build               # сборка shared → api → web (порядок важен)
npm run typecheck           # tsc --noEmit по всем воркспейсам
npm run lint                # eslint по всем воркспейсам
npm run test                # vitest (тесты только в API)
```

Запуск одного файла или одного теста:

```bash
npm run test --workspace @queue-tracker/api -- children.test.ts
npm run test --workspace @queue-tracker/api -- -t "computes queue positions"
```

> **Порядок сборки:** `shared` подключается через собранный `dist`, а не исходники.
> После свежего клонирования или правок в `shared` сначала выполните
> `npm run build --workspace @queue-tracker/shared`, иначе typecheck/dev/build
> остальных воркспейсов не найдут пакет.

## Переменные окружения

Скопируйте `.env.example` в `.env`. Значения валидируются Zod в
`apps/api/src/config.ts`.

| Переменная             | Назначение                                              |
| ---------------------- | ------------------------------------------------------- |
| `DATABASE_URL`         | Путь к файлу SQLite (по умолчанию `./data/app.db`)      |
| `CENTER_TIMEZONE`      | Часовой пояс центра (по умолчанию `Asia/Almaty`)        |
| `PUBLIC_APP_URL`       | Базовый URL веба — попадает в ссылки уведомлений         |
| `API_PORT`             | Порт API (по умолчанию `3001`)                          |
| `SESSION_SECRET`       | Секрет сессий, **минимум 32 символа** — иначе API не стартует |
| `SESSION_COOKIE_NAME`  | Имя cookie сессии                                       |
| `VITE_API_BASE_URL`    | Базовый URL API для веб-клиента                         |
| `ENABLE_DEV_ROUTES`    | `true` включает тестовые `/api/dev/*` (по умолч. выкл.) |

## Выпуск и эксплуатация

- **Продакшн-сборка:** `npm run build` (порядок shared → api → web).
- **Запуск API:** Node 22+, переменные окружения из таблицы выше; `SESSION_SECRET` ≥32 символов обязателен.
- **Dev-маршруты:** `/api/dev/*` — тестовые помощники без авторизации. В проде **не выставляйте** `ENABLE_DEV_ROUTES`; по умолчанию они отключены.
- **Бэкап данных:** состояние хранится в одном файле SQLite (`DATABASE_URL`, по умолчанию `./data/app.db`) — включите его в регулярный бэкап.
- **Создание сотрудников:** только через `npm run setup:employee` (публичной регистрации нет).
- **Приёмка перед релизом:** пройдите [docs/RELEASE_CHECKLIST.md](./docs/RELEASE_CHECKLIST.md).

## Архитектура

API слоистый: `routes/` (HTTP + разбор Zod + маппинг ошибок в статусы) →
`domain/` (бизнес-логика и весь доступ к БД) → `db/` + `lib/`. Точка сборки —
`index.ts` → `app.ts` (`createApp(db)`). БД передаётся аргументом, поэтому тесты
гоняют приложение против in-memory SQLite.

Группы маршрутов: `auth` (`/api/auth/*`), `public` (`/api/public/*`, без
авторизации), `admin` (`/api/admin/*`, под сессией), `dev` (`/api/dev/*`,
тестовые помощники — не выставлять в проде), `health`.

Ключевые доменные правила: мягкое удаление (архивирование), FIFO-очередь с
позицией, вычисляемой на чтение, оптимистичная блокировка через
`expectedUpdatedAt` (конфликт → 409), упорядоченные переходы статусов, запись
`audit_events` и `notification_events` при мутациях. Подробности — в
[CLAUDE.md](./CLAUDE.md).

## Структура

```
apps/
  api/        Hono API (routes → domain → db/lib), тесты vitest
  web/        React SPA (Vite)
packages/
  shared/     Zod-схемы, типы, подписи, хелперы валидации
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A queue-status tracker for a children's services center. Staff manage a single FIFO queue of children in an internal admin panel; parents view their child's status (stage, queue position, families ahead) on a public page via a personal token link or by searching their child's IIN. The product, all UI copy, and all user-facing API messages are **Russian-only** — match this when adding strings. The full product spec is in `PRD.md` (Russian); per-feature task breakdowns are in `tasks/` and `TASKS.md`.

## Commands

This is an npm-workspaces monorepo. Despite `packageManager: bun` in the root `package.json`, all scripts invoke `npm run ... --workspace`. **Requires Node 22+** — the API uses the native `node:sqlite` module.

```bash
npm install                 # install all workspaces

npm run dev                 # run API (:3001) + web (:5173) concurrently
npm run dev:api             # API only (tsx watch)
npm run dev:web             # web only (vite)

npm run build               # builds shared → api → web (order matters, see below)
npm run typecheck           # tsc --noEmit across all workspaces
npm run lint                # eslint across all workspaces
npm run test                # vitest run (API only; web has no tests)
```

Run a single test file or test:

```bash
npm run test --workspace @queue-tracker/api -- children.test.ts
npm run test --workspace @queue-tracker/api -- -t "computes queue positions"
```

Create/update an admin employee (no public registration exists):

```bash
npm run setup:employee --workspace @queue-tracker/api -- --login admin --name "Администратор" --password "secret"
```

Copy `.env.example` to `.env` before running. `SESSION_SECRET` must be ≥32 chars or the API refuses to boot (validated by Zod in `apps/api/src/config.ts`). The API has no `dotenv`; `config.ts` reads `process.env` directly, so the `dev` and `setup:employee` scripts load the root `.env` via Node's native `--env-file=../../.env` flag (see `apps/api/package.json`). Running those scripts another way (or adding a new script that needs config) requires passing `--env-file` yourself.

## Architecture

Three workspaces under `apps/*` and `packages/*`:

- **`packages/shared`** (`@queue-tracker/shared`) — Zod schemas, derived TS types, the `ChildStatus` enum + Russian labels, and IIN/phone normalization+validation helpers. This is the single source of truth for validation, **used by both the API and the web client.** When changing a request/response shape, change it here first.
- **`apps/api`** (`@queue-tracker/api`) — Hono server on `@hono/node-server`.
- **`apps/web`** (`@queue-tracker/web`) — React 19 + React Router 7 SPA built with Vite.

**Build ordering gotcha:** `shared` is consumed via its built output (`./dist`, see its `exports`/`main`), not its source. So `dist` must exist before the API or web can typecheck, dev, or build. The root `build` script handles this (shared first); after a fresh clone or any edit to shared, run `npm run build --workspace @queue-tracker/shared` before relying on `dev`/`typecheck` in the other workspaces.

### API layering

`apps/api/src` is layered: `routes/` (HTTP + Zod parse + error→status mapping) → `domain/` (business logic, all DB access) → `db/` + `lib/`. Composition root is `index.ts` → `app.ts` (`createApp(db)` wires CORS, the admin auth middleware, and all route groups). `createApp` takes the db as an argument, which is what lets tests run it against in-memory SQLite.

Route groups (`app.ts`): `auth` (`/api/auth/*`), `public` (`/api/public/*`, unauthenticated), `admin` (`/api/admin/*`, session-gated), `dev` (`/api/dev/*`, unauthenticated test helpers — do not expose in production), `health`.

### Database — two important conventions

1. **Runtime uses raw `node:sqlite`, not an ORM.** All queries are hand-written prepared statements in `domain/`. Drizzle (`db/schema.ts`, `drizzle.config.ts`, `drizzle/`) exists **only** for schema definition and drizzle-kit migration generation — it is never imported at runtime. The actual runtime schema is created idempotently by `bootstrapDatabase()` (`db/bootstrap.ts`, `CREATE TABLE IF NOT EXISTS ...`) called on startup. **`schema.ts` and `bootstrap.ts` are two hand-maintained copies of the same schema and must be kept in sync** when you change a table.
2. Use `runInTransaction(db, () => ...)` for any multi-statement mutation (see `db/client.ts`).

### Core domain rules (`domain/children.ts`)

- **Soft delete:** records are archived (`archived_at` set), never hard-deleted. IIN uniqueness is enforced only among active rows (`children_active_iin_unique ... WHERE archived_at IS NULL`), so an archived child's IIN can be re-added.
- **FIFO queue:** position is derived on read by counting active, non-`enrolled` children ordered by `(queued_at, id)` — it is not stored. `enrolled` and archived children have `null` position/familiesAhead. See `domain/queue.ts` and `getActiveQueuePositionMap`.
- **Optimistic concurrency:** mutating endpoints require `expectedUpdatedAt`; a mismatch with the row's current `updatedAt` throws `StaleChildRecordError` → HTTP 409. Preserve this when adding mutations.
- **Status transitions** (`assertAllowedStatusTransition`): the four stages are ordered (`documents_accepted → diagnostics_passed → waiting_for_enrollment → enrolled`). You may move forward exactly one step or backward any number; skipping forward is rejected.
- Mutations write `audit_events` (who/what) and `notification_events` (the message a parent would receive); `notification_events` also drives the "last notification message" shown in admin. Keep these writes when adding mutations.
- **Notification rendering is server-side:** the API never stores rendered strings, only event rows with a `payload_json`; the Russian text is built on read (`getLastNotificationMessage`) from the latest event + the child's status URL. Same for audit lines (`listChildAuditEvents`): `auditActionLabels` in shared + `payload_json` → rendered `actionLabel`/`details`/`employeeName`/`createdAtLabel`, with time formatted via `CENTER_TIMEZONE` (`lib/time.ts`).
- **One queue-advance notification per child per day:** `queue_position_changed` events are upserted, not appended — `upsertDailyQueuePositionEvent` rewrites the day's existing row (compared via `centerLocalDate` in `CENTER_TIMEZONE`) so only one current message per child per calendar day exists. Other event types are always appended.
- **Audit history** is read-only via `GET /api/admin/children/:id/audit` (session-gated), surfaced as the "История" tab on the admin child card. Copying the public link/message is intentionally *not* audited.

### Auth

Login verifies a scrypt password hash (`lib/security.ts`), then stores a session whose token is HMAC-SHA256-hashed before being persisted (plaintext token only lives in the httpOnly cookie). 12-hour TTL; expired sessions are cleaned up lazily. The `requireEmployeeSession` middleware (`middleware/auth.ts`) guards `/api/admin/*` and sets `c.var.employee`. Errors return Russian messages with 401.

### Web client

`src/lib/api.ts` is the only place that talks to the API: every call goes through `requestJson`, sends `credentials: "include"` for cookie auth, and **parses every response with the shared Zod schema**. It maps 401 → `UnauthorizedError` and other failures → `ApiRequestError`. Routes are declared in `src/app.tsx`; `pages/AdminLayout.tsx` is the auth-guarded shell for `/admin/*`.

The public pages (`SearchPage`, `StatusPage`, `NotFoundPage`) render `components/AdminEntryLink.tsx` — a fixed-position gear icon (top-right) linking to `/admin/login`, the only staff-facing entry point from the public side. It is intentionally **not** rendered inside `/admin/*`.

## Conventions

- **TypeScript is ESM with explicit `.js` extensions on relative imports** (e.g. `import { createApp } from "./app.js"`) even though sources are `.ts`. Match this. `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- Validate at the boundary with the shared Zod schemas; in routes, `safeParse`/`parse` then map `ZodError` to a 400 with `issues[0].message` (already-Russian messages live in the schemas).
- Throw typed domain errors (`ChildConflictError`, `ChildNotFoundError`, `StaleChildRecordError`, `InvalidStatusTransitionError`, …) from `domain/`; routes translate them to status codes in their `map...Error` helper. Don't put HTTP concerns in `domain/`.
- API tests (`apps/api/test/*.test.ts`, vitest) construct a fresh `:memory:` SQLite db, call `bootstrapDatabase`, and exercise either `createApp(db).request(...)` or the domain functions directly. Follow this pattern for new tests.

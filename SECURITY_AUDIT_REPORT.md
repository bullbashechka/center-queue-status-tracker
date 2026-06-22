# Ультра-глубокий аудит безопасности backend/frontend

Дата проверки: 2026-06-22.

Контекст релиза: продакшен через 4 дня, активная аудитория около 24 000 пользователей.

## Итоговая оценка

Текущий статус: **no-go для продакшена до закрытия критичных пунктов**.

Главные причины:

- dev API подключается всегда и содержит unauthenticated destructive endpoint;
- публичный поиск по ИИН остается поверхностью перебора персональных заявок;
- нет rate limit/lockout на вход сотрудников;
- есть high severity dependency finding в `drizzle-orm`;
- admin API использует последовательные numeric IDs.

Фронтенд не показал признаков прямого XSS через `dangerouslySetInnerHTML`, `innerHTML`, `eval`, хранение токенов в `localStorage/sessionStorage` или чтение `document.cookie`. Основные риски лежат на backend/API perimeter и в эксплуатационной конфигурации.

## Найденные проблемы

| # | Проблема | Где | Оценка |
| --- | --- | --- | --- |
| 1 | `registerDevRoutes` подключается всегда; `POST /api/dev/children/:id/archive` доступен без сессии и может архивировать записи перебором `id`. | `apps/api/src/app.ts`, `apps/api/src/routes/dev.ts` | 10/10 |
| 2 | Публичный поиск `GET /api/public/search?iin=...` позволяет подтверждать наличие активной заявки по ИИН и получать публичный token. Rate limit есть, но зависит от cookie device ID и IP. | `apps/api/src/routes/public.ts`, `apps/api/src/domain/searchRateLimit.ts` | 8/10 |
| 3 | `getClientIp` безусловно доверяет `X-Forwarded-For`; при прямом доступе к API атакующий может подменять IP и обходить IP-limit. | `apps/api/src/lib/clientIp.ts` | 8/10 |
| 4 | Нет rate limit, lockout/backoff и аудита failed login на `POST /api/auth/login`. `scryptSync` делает brute force еще и CPU-costly для сервера. | `apps/api/src/routes/auth.ts`, `apps/api/src/domain/auth.ts`, `apps/api/src/lib/security.ts` | 8/10 |
| 5 | `npm audit --omit=dev` нашел high vulnerability: `drizzle-orm <0.45.2`, SQL injection через improperly escaped SQL identifiers. | `apps/api/package.json`, `package-lock.json` | 7/10 |
| 6 | Cookie `Secure` выставляется по `PUBLIC_APP_URL.startsWith("https://")`; при ошибочной prod-конфигурации session cookie станет insecure. | `apps/api/src/middleware/auth.ts`, `apps/api/src/config.ts` | 7/10 |
| 7 | Admin API использует последовательные numeric IDs для чтения и мутаций. Внешне routes закрыты сессией, но любой авторизованный сотрудник может перебирать карточки и audit по ID. | `apps/api/src/routes/admin.ts`, `apps/api/src/domain/children.ts` | 6/10 |
| 8 | Cookie-based admin mutations не имеют CSRF-токена. `SameSite=Lax` и CORS снижают риск, но для production PII-системы этого недостаточно. | `apps/api/src/app.ts`, `apps/api/src/middleware/auth.ts`, `apps/web/src/lib/api.ts` | 6/10 |
| 9 | Публичные status links являются бессрочными bearer-ссылками до архивирования. Утечка ссылки дает доступ к статусу. | `apps/api/src/domain/children.ts`, `apps/web/src/pages/StatusPage.tsx` | 6/10 |
| 10 | Нет явной политики security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors. | API/app или edge config | 5/10 |
| 11 | Нет мониторинга и алертов по suspicious activity: failed login bursts, массовые 404 по child ID, поиск множества ИИН, частые 429. | backend/infrastructure | 5/10 |
| 12 | Публичный status response возвращает внутренний `id`; это раскрывает внутреннюю нумерацию и помогает оценивать размер базы. | `packages/shared/src/index.ts`, `apps/api/src/domain/children.ts` | 4/10 |
| 13 | Валидация route params через `Number(...)` без явной проверки `int positive`; `NaN` уходит в SQL и возвращает обычный not found. Это не injection, но слабый API-контракт и плохая база для мониторинга атак. | `apps/api/src/routes/admin.ts`, `apps/api/src/routes/dev.ts` | 4/10 |
| 14 | Роли сотрудников отсутствуют. По PRD это MVP-решение, но для продакшена с персональными данными оно означает полный доступ любого активного сотрудника. | auth/domain model | 4/10 |
| 15 | Frontend не содержит явных XSS sink-ов, но отображает PII в админском списке и карточках; нужен запрет индексирования, строгий cache policy и защита от screenshots/shoulder surfing уже на уровне процесса. | `apps/web/src/pages/AdminListPage.tsx`, `apps/web/src/pages/AdminChildPage.tsx` | 3/10 |

## Отдельный вывод по перебору ID

Детальный отчет сохранен в `SECURITY_ID_ENUMERATION_AUDIT.md`.

Коротко:

- публичных endpoint-ов вида `/api/public/.../:id` не найдено;
- критичный unauthenticated ID enumeration/destructive risk найден в `POST /api/dev/children/:id/archive`;
- admin routes используют numeric `children.id`; это закрыто сессией, но остается внутренним enumeration/IDOR risk.

## План доработок под релиз

### День 1: критичный backend perimeter

1. Выключить dev routes в production.
   - Добавить `ENABLE_DEV_ROUTES=false` по умолчанию.
   - Регистрировать `registerDevRoutes` только при явном локальном флаге.
   - Добавить тесты: без флага `/api/dev/children` и `/api/dev/children/:id/archive` возвращают `404`.

2. Добавить rate limit на login.
   - Лимит по login, IP и device/session fingerprint.
   - Backoff после нескольких ошибок.
   - Аудит failed login events.
   - Единый ответ без раскрытия, существует ли login.

3. Исправить доверие к `X-Forwarded-For`.
   - Принимать forwarded headers только от known proxy.
   - Если API доступен напрямую, использовать socket remote address.
   - Закрыть прямой доступ к API вне reverse proxy на уровне инфраструктуры.

### День 2: идентификаторы и публичный поиск

4. Убрать `id` из публичного `PublicStatusView`.
   - Изменить shared schema.
   - Изменить `mapChildToPublicView`.
   - Обновить frontend schema usage и тесты.

5. Перевести admin URL с numeric ID на opaque reference.
   - Добавить `admin_token`/`admin_ref` в `children`.
   - Использовать `/api/admin/children/:ref`.
   - Numeric `id` оставить только внутри БД.

6. Усилить публичный поиск по ИИН.
   - Минимум: более строгий rate limit и мониторинг.
   - Лучше: второй фактор знания, например последние цифры телефона родителя или одноразовый код.
   - Не возвращать token после одного ИИН без дополнительного фактора.

### День 3: session hardening и browser security

7. Добавить CSRF-защиту для admin mutations.
   - Double-submit CSRF cookie или synchronizer token.
   - Требовать `X-CSRF-Token` на `POST/PUT`.
   - Обновить `apps/web/src/lib/api.ts`.

8. Ужесточить cookie/env production config.
   - Ввести `NODE_ENV`/`APP_ENV`.
   - В production требовать HTTPS `PUBLIC_APP_URL`.
   - В production всегда ставить `Secure` для session cookie.
   - Добавить `__Host-` префикс cookie, если path/domain позволяют.

9. Добавить security headers.
   - `Content-Security-Policy`.
   - `Strict-Transport-Security`.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: no-referrer` или `strict-origin-when-cross-origin`.
   - `frame-ancestors 'none'`.

### День 4: supply chain, regression, release gate

10. Обновить vulnerable dependencies.
    - Обновить `drizzle-orm` до безопасной версии.
    - Разобрать `npm audit` по dev tooling (`esbuild`, `drizzle-kit`).
    - Зафиксировать lockfile.

11. Добавить regression security tests.
    - Admin routes без cookie дают `401`.
    - Dev routes выключены в prod config.
    - Невалидные route refs дают `400`, missing records дают единый `404`.
    - Public search rate limit нельзя обойти spoofed `X-Forwarded-For` при прямом запросе.
    - CSRF отсутствует/неверен: `403`.

12. Финальный release gate.
    - `npm test`.
    - `npm run typecheck`.
    - `npm run lint`.
    - `npm run build`.
    - `npm audit --omit=dev`.
    - Smoke test production-like environment.

## Выполненные проверки

Команды запускались локально:

- `npm test` — успешно, 23 теста прошли.
- `npm run typecheck` — успешно.
- `npm run lint` — успешно.
- `npm run build` — успешно.
- `npm audit --omit=dev` — найден 1 high severity finding в `drizzle-orm`.
- `npm audit` — найден high в `drizzle-orm` и moderate dev-chain findings вокруг `esbuild`.

## Рекомендация по релизу

Релиз можно считать допустимым только после закрытия пунктов 1-6 и 10-12 из плана. CSRF/security headers/session hardening также желательно закрыть до запуска, потому что после выхода на 24k пользователей цена исправлений и инцидентов резко вырастет.

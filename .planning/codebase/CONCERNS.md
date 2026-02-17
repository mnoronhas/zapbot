# Codebase Concerns

**Analysis Date:** 2026-02-17

## Tech Debt

**Webhook handler is a stub:**
- Issue: The WhatsApp POST webhook in `apps/engine/src/server.ts` (lines 42-57) returns 200 immediately but does nothing with the incoming message. Four TODO comments mark unimplemented steps: signature verification, message parsing, flow engine routing, and response sending. This is the critical data path -- without it, the bot cannot function at all.
- Files: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Impact: The entire bot runtime is non-functional. Incoming WhatsApp messages are acknowledged but silently discarded.
- Fix approach: Implement the webhook handler pipeline: (1) verify `X-Hub-Signature-256` header using `WhatsAppClient.verifyWebhookSignature()`, (2) parse the webhook body and extract `IncomingMessage` using `WhatsAppClient.parseIncomingMessage()`, (3) load conversation state from DB, (4) run `FlowEngine.process()`, (5) send outgoing messages via `WhatsAppClient`, (6) persist updated state.

**API routes not mounted:**
- Issue: All REST API routes for the frontend are commented out in `apps/engine/src/server.ts` (lines 63-67). Bot CRUD, conversation listing, appointment management, and analytics endpoints do not exist.
- Files: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Impact: The Next.js web app (not yet built) has no backend API to call. No CRUD operations are possible.
- Fix approach: Create Fastify route plugins for each resource (`/api/v1/bots`, `/api/v1/conversations`, `/api/v1/appointments`, `/api/v1/analytics`) and register them in the server.

**No encryption/decryption utility exists:**
- Issue: The DB schema stores `access_token_encrypted` (`zapbot-project/zapbot/packages/db/src/schema/index.ts`, line 75) and `google_refresh_token_encrypted` (line 131), and the `.env.example` defines `ENCRYPTION_KEY`. But there is zero encryption code anywhere in the codebase. No encrypt/decrypt functions exist.
- Files: `zapbot-project/zapbot/packages/db/src/schema/index.ts`, `zapbot-project/zapbot/.env.example`
- Impact: When tokens are eventually stored, they will either be stored in plaintext (violating the schema contract) or require last-minute encryption implementation. Tokens stored in plaintext represent a critical security risk.
- Fix approach: Create an encryption utility (AES-256-GCM recommended) in a shared location (e.g., `packages/db/src/crypto.ts` or a new `packages/shared/` package). Use `ENCRYPTION_KEY` from env. Provide `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string` functions.

**Flow engine `wait` node skips delay:**
- Issue: In `apps/engine/src/services/flow-engine.ts` (line 212), the `wait` node type has a `// TODO: Actually implement delay` comment and immediately executes the next node without any delay.
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`
- Impact: Any flow using `wait` nodes (e.g., "wait 30 seconds before follow-up") will execute instantly, breaking the intended user experience.
- Fix approach: Implement a delayed message system using a job queue (e.g., BullMQ with Redis, or a simple database-backed scheduler). The engine should save state and schedule a future execution rather than executing synchronously.

**Collect node has no input validation:**
- Issue: In `apps/engine/src/services/flow-engine.ts` (line 261), the `collect` node accepts any text input and stores it directly, despite the schema supporting `fieldType` validation for `phone`, `cpf`, `date`, `email`, and `number`.
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`
- Impact: Invalid data (malformed phone numbers, invalid CPFs, garbage dates) gets stored in conversation variables and potentially persisted as appointment data. Defeats the purpose of the `fieldType` schema field.
- Fix approach: Implement validation functions for each `FieldType` (regex for phone/CPF/email, date parsing for dates, `isNaN` check for numbers). On validation failure, send an error message and re-prompt.

**Appointment node is incomplete:**
- Issue: In `apps/engine/src/services/flow-engine.ts` (lines 268-270), the appointment selection/confirmation flow is a TODO stub. The engine emits a `fetch_availability` side effect but never processes the user's slot selection, books the appointment, or creates a calendar event.
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`
- Impact: The core differentiating feature (appointment booking) does not work end-to-end. The flow engine cannot complete appointment flows.
- Fix approach: Implement the multi-step appointment flow: (1) process `fetch_availability` side effect by calling `calculateAvailability()` from `@zapbot/calendar`, (2) present slots as a list/buttons, (3) capture selection, (4) call `createEvent()` to book on Google Calendar, (5) save appointment to `appointments` table, (6) advance to confirmation node.

**No database connection setup:**
- Issue: The engine imports `@zapbot/db` as a dependency but no database client is instantiated anywhere. There is no Drizzle client initialization, no connection string handling, and no query code.
- Files: `zapbot-project/zapbot/apps/engine/package.json`, `zapbot-project/zapbot/packages/db/src/index.ts`
- Impact: No database reads or writes are possible. Conversation state, bot flows, appointments -- nothing can be persisted or retrieved.
- Fix approach: Create a database client in `packages/db/src/index.ts` using `drizzle(postgres(connectionString))`. Export query helpers for conversations, bots, appointments. Import and use in the engine server.

**No Drizzle config file:**
- Issue: The `@zapbot/db` package defines migration scripts (`generate`, `migrate`, `studio`) but no `drizzle.config.ts` file exists. These scripts will fail.
- Files: `zapbot-project/zapbot/packages/db/package.json`
- Impact: Database migrations cannot be generated or applied. The schema definitions in `packages/db/src/schema/index.ts` cannot be synced to the database.
- Fix approach: Create `zapbot-project/zapbot/packages/db/drizzle.config.ts` specifying the schema path, output directory, dialect (`postgresql`), and database URL from environment.

**No RLS policies defined:**
- Issue: The CLAUDE.md specifies "Multi-tenant with Row-Level Security" and "Every table has `account_id`. Supabase RLS policies enforce isolation." However, no RLS policies exist in the codebase -- no SQL migration files, no policy definitions.
- Files: `zapbot-project/zapbot/packages/db/src/schema/index.ts`
- Impact: All tenants can read/write all data. Complete multi-tenant isolation failure. This is a critical security gap for a production system.
- Fix approach: Create SQL migration files that enable RLS on all tables and define policies that filter by `account_id` matching the authenticated user's account. Test with Supabase's policy simulator.

## Known Bugs

**`googleapis` dependency declared but not used:**
- Symptoms: `@zapbot/calendar` lists `googleapis: ^140.0.0` as a dependency but the calendar package uses raw `fetch()` calls to the Google Calendar REST API instead.
- Files: `zapbot-project/zapbot/packages/calendar/package.json`, `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Trigger: `pnpm install` will download ~50MB of unused googleapis SDK.
- Workaround: The code works without it; it is just wasted disk/install time.

**Availability calculator ignores timezone in date math:**
- Symptoms: `generatePossibleSlots()` in `zapbot-project/zapbot/packages/calendar/src/index.ts` (lines 307-351) uses `setHours()` and `getDay()` which operate in the system's local timezone, not the `timezone` parameter passed to the function. The `timezone` param is accepted but never used.
- Files: `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Trigger: When the server runs in UTC (production) but appointments are in `America/Sao_Paulo` (UTC-3), slot times will be offset by 3 hours, generating incorrect availability windows.
- Workaround: None currently. Will produce wrong slots in production.

**Prototype editor uses linear flow, engine uses graph:**
- Symptoms: `ZapBot_Editor_Prototype.jsx` models flows as an ordered array (linear sequence), advancing by array index (`currentIdx + 1`). The actual `@zapbot/flow-schema` and `FlowEngine` use a directed graph with `next` pointers and branching.
- Files: `ZapBot_Editor_Prototype.jsx`, `zapbot-project/zapbot/packages/flow-schema/src/index.ts`
- Trigger: Any flow with branching (condition nodes, multiple button paths) cannot be represented or tested in the prototype editor.
- Workaround: The prototype is a UI/UX demo only. The real editor must implement graph-based editing.

## Security Considerations

**Webhook signature verification disabled by default:**
- Risk: `WhatsAppClient.verifyWebhookSignature()` in `zapbot-project/zapbot/packages/whatsapp/src/index.ts` (lines 158-168) returns `true` (skips verification) when `appSecret` is not configured. The server's webhook handler does not call this method at all (it is a TODO). Anyone can send fake webhook payloads to the engine.
- Files: `zapbot-project/zapbot/packages/whatsapp/src/index.ts`, `zapbot-project/zapbot/apps/engine/src/server.ts`
- Current mitigation: None.
- Recommendations: (1) Make `appSecret` required in `WhatsAppConfig` (remove the `?` optional marker). (2) Wire up signature verification in the webhook POST handler. (3) Reject requests with invalid or missing signatures with 401.

**No authentication on API routes:**
- Risk: The engine server has no authentication middleware. When API routes are added, they will be publicly accessible. Any unauthenticated client can read/modify any tenant's data.
- Files: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Current mitigation: API routes are not implemented yet, so there is nothing to exploit.
- Recommendations: Implement Supabase JWT verification middleware. Validate the `Authorization: Bearer <token>` header on every `/api/v1/*` route. Extract `account_id` from the JWT claims and scope all queries to that account.

**No input sanitization on user-provided text:**
- Risk: The flow engine's `interpolate()` method in `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts` (line 322) substitutes `{variable}` placeholders with raw user input. If flow content is rendered in a web dashboard, this creates an XSS vector. User input stored in `variables` JSONB column is also unsanitized.
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`, `zapbot-project/zapbot/packages/db/src/schema/index.ts`
- Current mitigation: None.
- Recommendations: Sanitize user input before storing in variables. At minimum, strip HTML tags and control characters. For the web dashboard, use proper output encoding when rendering conversation data.

**CORS allows configurable single origin only:**
- Risk: CORS in `apps/engine/src/server.ts` (line 8) uses `process.env.APP_URL || "http://localhost:3000"` as a single allowed origin. If the web app is served from multiple domains or subdomains, this will need updating. The fallback to `localhost:3000` in production would be overly permissive if `APP_URL` is accidentally unset.
- Files: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Current mitigation: Single origin is appropriate for MVP.
- Recommendations: Add a validation check that `APP_URL` is set in production. Consider a whitelist of allowed origins for staging/production environments.

**No request body size limits:**
- Risk: Fastify's default body size limit is 1MB, which is reasonable, but there is no explicit configuration. Large payloads could consume memory.
- Files: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Current mitigation: Fastify defaults.
- Recommendations: Explicitly set `bodyLimit` on the Fastify instance for defense-in-depth.

## Performance Bottlenecks

**FlowEngine auto-advance recursion:**
- Problem: `executeNode()` in `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts` (lines 117-221) recursively calls itself for auto-advancing nodes (message chains, conditions). A deeply nested flow with many sequential message nodes and conditions could cause stack overflow.
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`
- Cause: Recursive design with no depth limit. Each `message` node with a `next` pointer triggers another recursive call.
- Improvement path: Add a max recursion depth constant (e.g., 50). Convert to iterative loop with a while loop and a `currentNode` pointer. Track visited nodes to detect infinite loops in cyclic flows.

**No database query optimization patterns:**
- Problem: No database queries exist yet, but the schema has no composite indexes for common query patterns. For example, looking up an active conversation for a phone number on a specific bot requires scanning `conversations_phone_idx` and then filtering.
- Files: `zapbot-project/zapbot/packages/db/src/schema/index.ts`
- Cause: Individual column indexes exist but no composite indexes for multi-column lookups.
- Improvement path: Add composite indexes: `(account_id, contact_phone, status)` on `conversations`, `(account_id, start_time, status)` on `appointments`. These match the most common query patterns.

## Fragile Areas

**FlowEngine state management:**
- Files: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`
- Why fragile: The engine modifies `output.state` in place across recursive calls. The `process()` method starts by shallow-copying state (`{ ...state }`) but nested objects like `variables` are shared references. Mutations to `variables` in one branch affect the original.
- Safe modification: Deep clone the state at the entry point of `process()`. Use immutable update patterns for variables.
- Test coverage: Zero test files exist. No unit tests for any node type execution, condition evaluation, or variable interpolation.

**Calendar availability calculation:**
- Files: `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Why fragile: The slot generation uses `Date` object manipulation with `setHours()`, `getDay()`, and `setDate()` which are mutable operations and timezone-sensitive. The `timezone` parameter is accepted but ignored. Buffer time is applied inconsistently -- it is added to the end of slots when checking against busy times (line 292) but also used as spacing between generated slots (line 342), creating a double-buffer effect.
- Safe modification: Switch to a timezone-aware date library (e.g., `date-fns-tz` or `luxon`). Write comprehensive tests before modifying.
- Test coverage: No tests.

## Scaling Limits

**No job queue or async processing:**
- Current capacity: The engine processes webhook messages synchronously in the request handler. With Fastify's single-event-loop model, long-running operations (Google Calendar API calls, database queries) block other requests.
- Limit: Under high message volume (100+ concurrent conversations with appointment booking), latency will spike. Google Calendar API calls can take 200-500ms each.
- Scaling path: Introduce a job queue (BullMQ + Redis) for async processing. Return 200 immediately from webhook, enqueue the message, process in a worker. This also enables the `wait` node implementation.

**Single-instance engine:**
- Current capacity: One Fastify process handles all webhook traffic.
- Limit: A single process can handle ~1000-5000 req/s depending on operation complexity, but webhook processing involves multiple I/O operations per request.
- Scaling path: The stateless design (conversation state in DB) already supports horizontal scaling. Add a load balancer and run multiple engine instances. Ensure the job queue uses Redis for coordination.

**Analytics events table has no partitioning or TTL:**
- Current capacity: The `analytics_events` table will grow unbounded. Every node visit generates an event.
- Limit: At 100 conversations/day with 5 nodes average = 500 events/day = 180K events/year. Manageable for MVP but queries will slow without partitioning.
- Scaling path: Add time-based partitioning on `created_at`. Consider aggregating old events and purging raw data after 90 days.

## Dependencies at Risk

**`googleapis` (^140.0.0) -- unused:**
- Risk: Listed as a dependency of `@zapbot/calendar` but not imported anywhere. The package uses raw `fetch()` instead. Adds ~50MB of unnecessary install weight.
- Impact: Slower installs, larger node_modules, potential security surface.
- Migration plan: Remove from `packages/calendar/package.json`.

**Missing lockfile (pnpm-lock.yaml):**
- Risk: No `pnpm-lock.yaml` file exists. This means dependency versions are not pinned, leading to non-reproducible builds. Different developers or CI environments may install different versions.
- Impact: Potential "works on my machine" issues. A transitive dependency update could introduce breaking changes silently.
- Migration plan: Run `pnpm install` to generate the lockfile. Commit it to version control.

**Version ranges are wide:**
- Risk: All dependencies use `^` ranges (e.g., `fastify: ^5.0.0`, `drizzle-orm: ^0.33.0`). Combined with the missing lockfile, this creates high risk of unexpected breaking changes.
- Impact: Fastify 5.x and Drizzle 0.x are both in active development with potential breaking changes in minor/patch versions.
- Migration plan: Generate and commit lockfile. Consider narrowing ranges for critical dependencies.

## Missing Critical Features

**No web application (Next.js frontend):**
- Problem: The `apps/web/` directory does not exist. The CLAUDE.md architecture defines a Next.js 14 frontend with visual flow editor, dashboard, and settings, but none of it has been created.
- Blocks: Users cannot create, edit, or manage bots. No onboarding flow, no Google Calendar connection UI, no conversation monitoring.

**No authentication system:**
- Problem: No Supabase Auth integration exists. No login/signup flow, no session management, no JWT validation middleware.
- Blocks: Multi-tenancy cannot be enforced. All data is publicly accessible once API routes are added.

**No appointment reminder system:**
- Problem: The schema includes `reminder_sent` (boolean) on appointments, and the CLAUDE.md specifies 24h-before reminders using WhatsApp message templates. No scheduler or cron job exists to send reminders.
- Blocks: Patients do not receive appointment reminders, increasing no-show rates.

**No handoff implementation:**
- Problem: The `handoff` node type sets `status: "handed_off"` on the conversation state and emits a side effect, but there is no human agent interface, no notification system, and no way to route conversations to a human.
- Blocks: The "Talk to a human" flow path dead-ends with no way for clinic staff to receive or respond to handed-off conversations.

## Test Coverage Gaps

**Zero test files in the entire codebase:**
- What's not tested: Every package and app. No unit tests, no integration tests, no E2E tests. Despite all packages having `vitest` as a devDependency and test scripts configured, no test files exist.
- Files: All packages under `zapbot-project/zapbot/packages/` and `zapbot-project/zapbot/apps/engine/`
- Risk: Any code change could introduce regressions with zero automated detection. The flow engine's node execution, condition evaluation, variable interpolation, calendar availability calculation, WhatsApp message parsing, and Zod schema validation are all untested.
- Priority: **High** -- The flow engine (`apps/engine/src/services/flow-engine.ts`) and flow schema validation (`packages/flow-schema/src/index.ts`) are the most critical to test first, followed by calendar availability calculation (`packages/calendar/src/index.ts`).

**No vitest configuration:**
- What's not tested: Vitest will use defaults, but no `vitest.config.ts` files exist in any package. Test setup, coverage thresholds, and module resolution are unconfigured.
- Files: All packages
- Risk: When tests are eventually written, they may fail due to module resolution issues (ESM, TypeScript paths) without proper vitest config.
- Priority: **Medium** -- Create vitest configs before writing tests.

## Deployment/Infrastructure Gaps

**No `infra/` directory:**
- Problem: The CLAUDE.md architecture shows an `infra/` directory for "Docker, deploy configs" but it does not exist.
- Impact: No Dockerfile, no docker-compose, no CI/CD pipeline, no deployment automation. Manual deployment only.
- Fix approach: Create `infra/` with a Dockerfile for the engine, a docker-compose for local development (PostgreSQL, Redis), and a GitHub Actions workflow for CI.

**No CI/CD pipeline:**
- Problem: No `.github/workflows/`, no `Jenkinsfile`, no GitLab CI config, no deployment automation of any kind.
- Impact: No automated testing, linting, or deployment. Code quality is entirely manual.
- Fix approach: Create a GitHub Actions workflow that runs `pnpm install`, `pnpm lint`, `pnpm test`, and `pnpm build` on every PR.

**No health check for production readiness:**
- Problem: The `/health` endpoint in `apps/engine/src/server.ts` (line 14) returns `{ status: "ok" }` but does not check database connectivity, external service availability, or any meaningful health indicators.
- Impact: A load balancer or orchestrator (Railway, K8s) will route traffic to an instance that cannot reach the database.
- Fix approach: Add database ping and basic dependency checks to the health endpoint. Return 503 if critical dependencies are unreachable.

---

*Concerns audit: 2026-02-17*

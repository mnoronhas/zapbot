---
phase: 01-foundation
plan: 01
subsystem: database
tags: [drizzle-orm, drizzle-kit, postgres, supabase, rls, aes-256-gcm, encryption, typescript]

# Dependency graph
requires: []
provides:
  - "drizzle.config.ts: Drizzle Kit migration config for Supabase PostgreSQL"
  - "adminDb: Service-role database client bypassing RLS (for webhooks, triggers)"
  - "createAuthenticatedDb: RLS-scoped database client setting JWT context in transactions"
  - "encrypt/decrypt: AES-256-GCM token encryption utility for secrets at rest"
  - "@zapbot/db barrel export: schema + client + crypto available from single import"
affects:
  - 01-02
  - 02-flow-editor
  - 03-whatsapp
  - 04-execution-engine
  - 05-google-calendar
  - 06-dashboard

# Tech tracking
tech-stack:
  added:
    - "drizzle-orm ^0.45.1 (upgraded from ^0.33.0 — array syntax support)"
    - "drizzle-kit ^0.31.9 (upgraded from ^0.24.0 — entities.roles.provider support)"
    - "dotenv ^16.4.0 (for drizzle.config.ts env loading)"
    - "@types/node ^20.0.0 (for node:crypto and process globals)"
    - "postgres ^3.4.0 (postgres.js driver, already declared)"
  patterns:
    - "Dual DB client pattern: adminDb (bypasses RLS) + createAuthenticatedDb (enforces RLS via SET LOCAL ROLE + set_config)"
    - "prepare: false on all postgres.js connections (required for Supabase Transaction pooler)"
    - "AES-256-GCM storage format: base64(iv[12] + authTag[16] + ciphertext)"
    - "ENCRYPTION_KEY validated as exactly 64 hex chars at call time (not startup)"

key-files:
  created:
    - "zapbot-project/zapbot/packages/db/drizzle.config.ts"
    - "zapbot-project/zapbot/packages/db/src/client.ts"
    - "zapbot-project/zapbot/packages/db/src/crypto.ts"
    - "zapbot-project/zapbot/packages/db/src/test-crypto.ts"
    - "zapbot-project/zapbot/packages/db/tsconfig.json"
  modified:
    - "zapbot-project/zapbot/packages/db/src/index.ts"
    - "zapbot-project/zapbot/packages/db/package.json"
    - "zapbot-project/zapbot/apps/engine/package.json"
    - "zapbot-project/zapbot/pnpm-lock.yaml"

key-decisions:
  - "Upgraded drizzle-orm to ^0.45.0 and drizzle-kit to ^0.31.0: existing schema used array syntax (table) => [...] which requires drizzle-orm 0.36+"
  - "Used separate postgres connections for adminDb and rlsDb (not connection pool sharing): ensures RLS context doesn't bleed between concurrent requests"
  - "ENCRYPTION_KEY validated at call-time not startup: allows package import without env var present (useful in build/test contexts)"
  - "Used .js extensions in barrel export imports (ESM module resolution)"

patterns-established:
  - "Pattern: adminDb for service-role operations (webhook processing, auth triggers, admin scripts)"
  - "Pattern: db.rls(async (tx) => {...}) for all user-facing queries requiring tenant isolation"
  - "Pattern: encrypt(token) / decrypt(token) for all OAuth tokens and sensitive credentials stored in DB"

# Metrics
duration: 35min
completed: 2026-02-17
---

# Phase 1 Plan 01: Database Foundation (Drizzle Config, Dual Clients, Encryption) Summary

**Drizzle Kit config + dual Postgres clients (adminDb/RLS-scoped) + AES-256-GCM encryption utility ready for all subsequent phases to import from @zapbot/db**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-02-17T (session start)
- **Completed:** 2026-02-17
- **Tasks:** 2 completed
- **Files modified:** 9

## Accomplishments

- `drizzle.config.ts` configured for Supabase PostgreSQL with `entities.roles.provider: "supabase"` (excludes Supabase-managed roles from diff)
- `client.ts` exports `adminDb` (bypasses RLS for service operations) and `createAuthenticatedDb` (wraps transactions with JWT context for RLS enforcement)
- `crypto.ts` exports `encrypt`/`decrypt` using AES-256-GCM with ENCRYPTION_KEY env var (32-byte hex)
- `index.ts` barrel re-exports schema, client, and crypto as single `@zapbot/db` import
- 8-case smoke test for encryption verified all round-trips, unicode, empty string, random IV uniqueness, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: drizzle.config.ts + dual database clients** - `d3a1b17` (feat — committed as part of prior agent session's 01-02 scaffold commit)
2. **Task 2: AES-256-GCM encryption utility + barrel export** - `17acb9d` (feat)

## Files Created/Modified

- `zapbot-project/zapbot/packages/db/drizzle.config.ts` - Drizzle Kit config pointing at schema, `./drizzle` output, Supabase dialect
- `zapbot-project/zapbot/packages/db/src/client.ts` - adminDb and createAuthenticatedDb with prepare:false on both connections
- `zapbot-project/zapbot/packages/db/src/crypto.ts` - AES-256-GCM encrypt/decrypt with ENCRYPTION_KEY validation
- `zapbot-project/zapbot/packages/db/src/test-crypto.ts` - 8-case smoke test (all passing)
- `zapbot-project/zapbot/packages/db/src/index.ts` - Updated barrel: schema + client + crypto exports
- `zapbot-project/zapbot/packages/db/tsconfig.json` - New: extends root tsconfig, adds @types/node
- `zapbot-project/zapbot/packages/db/package.json` - Added dotenv, @types/node; upgraded drizzle-orm/kit
- `zapbot-project/zapbot/apps/engine/package.json` - Updated drizzle-orm to ^0.45.0 for version consistency
- `zapbot-project/zapbot/pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- **Upgraded drizzle-orm to ^0.45.0 (was ^0.33.0):** The existing schema used array syntax `(table) => [index1, index2]` in table definitions. This API was added in drizzle-orm 0.36. drizzle-kit was also upgraded to ^0.31.0 to match and gain `entities.roles.provider` config support.
- **Separate postgres connections for admin/rls:** Using different connection instances ensures RLS transaction context from `createAuthenticatedDb` cannot bleed to `adminDb` operations.
- **`prepare: false` on both connections:** Supabase uses PgBouncer in Transaction mode which doesn't support prepared statements. Missing this causes `"prepared statement already exists"` errors in production.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Upgraded drizzle-orm from ^0.33.0 to ^0.45.0**

- **Found during:** Task 1 (TypeScript compilation verification)
- **Issue:** Existing schema `src/schema/index.ts` uses array syntax `(table) => [...]` for pgTable constraints (indexes, unique indexes). This API was introduced in drizzle-orm 0.36. TypeScript reported: `Type 'IndexBuilder[]' is not assignable to type 'PgTableExtraConfig'`
- **Fix:** Updated drizzle-orm to `^0.45.0` and drizzle-kit to `^0.31.0` in both `packages/db/package.json` and `apps/engine/package.json`. Reinstalled dependencies.
- **Files modified:** `packages/db/package.json`, `apps/engine/package.json`, `pnpm-lock.yaml`
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** `17acb9d` (Task 2 commit, as part of package.json update)

**2. [Rule 3 - Blocking] Created tsconfig.json for packages/db**

- **Found during:** Task 1 (TypeScript compilation verification — required by task's verify step)
- **Issue:** No `tsconfig.json` existed in `packages/db/`. The verify step required `npx tsc --noEmit --project packages/db/tsconfig.json`.
- **Fix:** Created `packages/db/tsconfig.json` extending `../../tsconfig.json` with `types: ["node"]` and `@types/node` added to devDependencies.
- **Files modified:** `packages/db/tsconfig.json` (new), `packages/db/package.json`
- **Verification:** `tsc --noEmit` passes
- **Committed in:** `d3a1b17` (Task 1 commit)

**3. [Rule 1 - Bug] Removed non-existent `entities` property from drizzle-kit 0.24 drizzle.config.ts**

- **Found during:** Task 1 (TypeScript check revealed `entities` not in drizzle-kit 0.24 types)
- **Issue:** The plan specified `entities.roles.provider: "supabase"` in drizzle.config.ts, but drizzle-kit 0.24 doesn't have this property. After upgrading to 0.31.9, the property IS supported and was retained.
- **Fix:** Upgraded drizzle-kit to 0.31.9; `entities` remains in config and now compiles correctly.
- **Files modified:** `packages/db/package.json`
- **Verification:** `tsc --noEmit` passes, entities type definition confirmed in drizzle-kit 0.31.9's `index.d.ts`
- **Committed in:** `17acb9d`

---

**Total deviations:** 3 auto-fixed (1 bug: version mismatch, 1 blocking: missing tsconfig, 1 bug: API version compatibility)
**Impact on plan:** All auto-fixes were necessary for correctness. No scope creep. The schema was pre-written for a newer drizzle API, requiring a version upgrade to match.

## Issues Encountered

- pnpm was not on PATH in the bash shell environment. Installed globally via `npm install -g pnpm`. This was a one-time setup for the execution environment.
- Task 1 files (drizzle.config.ts, client.ts, package.json, tsconfig.json) were already committed in a prior agent session's commit `d3a1b17` (mixed with 01-02 web scaffold files). Treated as complete and proceeded to Task 2.

## User Setup Required

External services require manual configuration before the database can be used:

**Environment variables needed:**

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase Dashboard > Settings > Database > Connection string (Transaction pooler, port 6543) |
| `SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API > service_role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API > anon key |
| `ENCRYPTION_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**To create a Supabase project:** supabase.com > Dashboard > New Project

## Next Phase Readiness

- `@zapbot/db` package is ready to import in all apps (`adminDb`, `createAuthenticatedDb`, `encrypt`, `decrypt`, full schema)
- `pnpm db:generate` will work once `DATABASE_URL` is set (generates Drizzle migrations from schema)
- `pnpm db:migrate` will apply migrations to Supabase PostgreSQL
- No blockers for next plans in Phase 1 (auth middleware, RLS policies, API routes)

---
*Phase: 01-foundation*
*Plan: 01*
*Completed: 2026-02-17*

## Self-Check: PASSED

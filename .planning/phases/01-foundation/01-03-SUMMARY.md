---
phase: 01-foundation
plan: 03
subsystem: database
tags: [drizzle-orm, postgresql, supabase, rls, row-level-security, multi-tenancy, pgpolicy]

# Dependency graph
requires:
  - phase: 01-01
    provides: Drizzle schema with all 9 table definitions, drizzle.config.ts, database client

provides:
  - RLS policies on all 9 tenant-scoped tables via Drizzle pgPolicy
  - enableRLS() called on every table in the schema
  - Initial database migration SQL (0000_eminent_wonder_man.sql) with CREATE TABLE, ENABLE ROW LEVEL SECURITY, and CREATE POLICY for all 9 tables
  - Migration ready to apply with pnpm db:migrate once DATABASE_URL is configured

affects:
  - 01-04 (Fastify auth middleware uses RLS-enforced tables)
  - All future phases that query tenant data (flows editor, WhatsApp engine, calendar)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pgPolicy in third arg array alongside indexes on pgTable"
    - "enableRLS() chained on pgTable result"
    - "myAccountId SQL helper subquery reused across all account_id tables"
    - "accounts table uses auth.uid() directly; all other tables use subquery through accounts"
    - "messages and bot_versions use join-through policies (through conversations and bots)"

key-files:
  created:
    - zapbot-project/zapbot/packages/db/drizzle/0000_eminent_wonder_man.sql
    - zapbot-project/zapbot/packages/db/drizzle/meta/_journal.json
    - zapbot-project/zapbot/packages/db/drizzle/meta/0000_snapshot.json
  modified:
    - zapbot-project/zapbot/packages/db/src/schema/index.ts

key-decisions:
  - "pgPolicy and enableRLS() both supported in drizzle-orm 0.45.1 — no raw SQL migration needed"
  - "authenticatedRole imported from drizzle-orm/supabase (re-exports from pg-core/roles)"
  - "pgPolicy imported from drizzle-orm/pg-core (exported via policies.js)"
  - "myAccountId SQL helper defined once and reused — avoids repetition and keeps policies DRY"
  - "pnpm db:generate runs without DATABASE_URL — diffs schema files against migration history only"

patterns-established:
  - "RLS pattern: accounts table => auth.uid() = supabase_user_id directly"
  - "RLS pattern: all account_id tables => account_id = (SELECT id FROM accounts WHERE supabase_user_id = auth.uid())"
  - "RLS pattern: join-through tables (messages, bot_versions) => parent_id IN (SELECT id FROM parent_table WHERE account_id = myAccountId)"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 1 Plan 03: RLS Policies + Initial Migration Summary

**Drizzle pgPolicy tenant isolation on all 9 tables with enableRLS(), generating migration SQL that enables RLS and creates policies in one atomic operation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T19:31:43Z
- **Completed:** 2026-02-17T19:34:33Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added pgPolicy tenant isolation to all 9 tables in the Drizzle schema with a single reusable `myAccountId` SQL subquery helper
- Called `.enableRLS()` on every table (supported natively in drizzle-orm 0.45.1, no raw SQL workaround needed)
- Generated initial migration `0000_eminent_wonder_man.sql` via `pnpm db:generate` — contains all CREATE TABLE, ENABLE ROW LEVEL SECURITY, and CREATE POLICY statements for all 9 tables

## Task Commits

Each task was committed atomically:

1. **Task 1: Add RLS policies to all tenant-scoped tables** - `6d76630` (feat)
2. **Task 2: Generate initial database migration** - `2a4cb64` (feat)

**Plan metadata:** (in final commit — docs)

## Files Created/Modified

- `zapbot-project/zapbot/packages/db/src/schema/index.ts` - Added pgPolicy to all 9 tables, enableRLS() on all, myAccountId helper, new imports (pgPolicy, authenticatedRole, sql)
- `zapbot-project/zapbot/packages/db/drizzle/0000_eminent_wonder_man.sql` - Initial migration with all 9 CREATE TABLE, 9 ENABLE ROW LEVEL SECURITY, 9 CREATE POLICY, all foreign keys and indexes
- `zapbot-project/zapbot/packages/db/drizzle/meta/_journal.json` - Drizzle migration journal
- `zapbot-project/zapbot/packages/db/drizzle/meta/0000_snapshot.json` - Schema snapshot for future diffs

## Decisions Made

- **drizzle-orm 0.45.1 supports enableRLS() natively** — The research noted uncertainty about whether `.enableRLS()` would be available. Verified it is: `PgTableWithColumns` has `enableRLS: () => Omit<PgTableWithColumns<T>, 'enableRLS'>` in the type definitions. No raw SQL migration workaround needed.
- **pgPolicy imported from drizzle-orm/pg-core** — Exported via `pg-core/policies.js` which is re-exported from `pg-core/index.js`. The `authenticatedRole` comes from `drizzle-orm/supabase` (which re-exports from `pg-core/roles.js`).
- **pnpm db:generate works without DATABASE_URL** — Confirmed: drizzle-kit generate only diffs schema files against migration history. Only `pnpm db:migrate` needs a live connection.
- **myAccountId SQL helper defined at module scope** — Drizzle's `sql` template literal creates a reusable SQL expression that gets interpolated correctly into each policy's using/withCheck clauses.

## Deviations from Plan

None - plan executed exactly as written. All drizzle-orm APIs were available as expected in version 0.45.1. The `.enableRLS()` uncertainty noted in RESEARCH.md resolved to "fully supported."

## Issues Encountered

None.

## User Setup Required

None from this plan specifically. The migration is ready to apply, but DATABASE_URL must be set first (documented as a blocker in STATE.md from Plan 01-01).

To apply the migration once DATABASE_URL is configured:
```bash
cd zapbot-project/zapbot && pnpm db:migrate
```

## Next Phase Readiness

- Database schema is fully defined with RLS enforcement
- Migration is ready to apply to a fresh Supabase database
- Plan 01-04 (Fastify auth middleware) can proceed — it will use `adminDb` to bypass RLS for webhook processing and `createAuthenticatedDb` for user-scoped queries
- After migration is applied and Supabase trigger is created (Pattern 5 in RESEARCH.md), the full auth flow will be operational

**Blockers (carried forward):**
- User must configure DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY before running `pnpm db:migrate`
- Supabase `on_auth_user_created` trigger must be created manually in Supabase Dashboard SQL editor (see RESEARCH.md Pattern 5)

---
*Phase: 01-foundation*
*Completed: 2026-02-17*

## Self-Check: PASSED

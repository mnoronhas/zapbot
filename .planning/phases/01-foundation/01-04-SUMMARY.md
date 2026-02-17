---
phase: 01-foundation
plan: "04"
subsystem: api
tags: [fastify, jwt, jose, jwks, lru-cache, auth-middleware, rest-api, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: adminDb, accounts table schema, @zapbot/db package
provides:
  - Fastify JWT auth middleware (requireAuth) using jose JWKS verification
  - GET/PATCH /api/v1/account endpoints
  - GET/POST /api/v1/bots endpoints
  - Account LRU cache with 5-minute TTL
  - Fastify request type augmentation (jwtClaims, account)
affects:
  - Phase 3 (WhatsApp webhooks - auth pattern for future protected routes)
  - Phase 4 (Flow execution engine - same requireAuth pattern)
  - Phase 5 (Calendar scheduling - protected account routes)

# Tech tracking
tech-stack:
  added:
    - jose ^6.1.3 (JWKS-based JWT verification, ESM-native)
    - lru-cache ^11.2.6 (account lookup caching)
    - "@types/node (dev, added to engine)"
  patterns:
    - JWKS-based JWT verification (not static secret) via createRemoteJWKSet
    - onRequest hook pattern for per-route authentication
    - LRU cache for DB lookup caching (5 min TTL)
    - FastifyPluginAsync for modular route organization
    - adminDb with explicit WHERE instead of RLS for API routes

key-files:
  created:
    - zapbot-project/zapbot/apps/engine/src/middleware/auth.ts
    - zapbot-project/zapbot/apps/engine/src/routes/account.ts
    - zapbot-project/zapbot/apps/engine/src/routes/bots.ts
    - zapbot-project/zapbot/apps/engine/tsconfig.json
  modified:
    - zapbot-project/zapbot/apps/engine/src/server.ts
    - zapbot-project/zapbot/apps/engine/package.json
    - zapbot-project/zapbot/pnpm-lock.yaml

key-decisions:
  - "adminDb (not RLS client) for API routes — middleware already scopes by account_id, explicit WHERE is simpler and sufficient"
  - "JWKS fetched via createRemoteJWKSet (jose auto-handles key rotation and caching)"
  - "SUPABASE_URL validated at module load time (throws on startup if missing)"
  - "LRU cache keyed by Supabase user ID (sub claim), clearAccountCache() exported for post-update invalidation"
  - "PORT env var takes precedence over ENGINE_PORT (Railway compatibility)"
  - "host '::' for dual-stack IPv4+IPv6 binding (Railway deployment requirement)"

patterns-established:
  - "Protected routes: { onRequest: [requireAuth] } in route options"
  - "Error format: { error: string (PT-BR), code: string (English) }"
  - "Response format: { data: T } for successful responses"
  - "Bot creation default: name='Meu Bot', flowJson={ version:1, startNodeId:'start', nodes:[] }"

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 1 Plan 04: Engine Auth Middleware and API Routes Summary

**Fastify JWT auth middleware using jose JWKS (Supabase-compatible), with LRU-cached account lookups and protected /api/v1/account and /api/v1/bots endpoints**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-17T19:30:16Z
- **Completed:** 2026-02-17T19:35:58Z
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments
- JWT verification middleware (`requireAuth`) using Supabase JWKS endpoint via jose — works for HS256 and ES256, handles key rotation automatically
- Account LRU cache (1000 entries, 5 min TTL) prevents N+1 DB queries per API request
- Fastify type augmentation: `request.jwtClaims` and `request.account` available in all protected handlers
- `GET /api/v1/account` returns authenticated user's full account object
- `PATCH /api/v1/account` updates account fields with cache invalidation
- `GET /api/v1/bots` returns all bots scoped to authenticated account
- `POST /api/v1/bots` creates new bot with empty flow JSON template
- `/health` and `/webhooks/whatsapp` remain unauthenticated (no change)

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth middleware with jose JWKS verification** - `2ccbe64` (feat)
2. **Task 2: API routes and wire into server** - `0cb8774` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/engine/src/middleware/auth.ts` - JWT verification via jose JWKS, LRU account cache, requireAuth hook, clearAccountCache()
- `apps/engine/src/routes/account.ts` - GET and PATCH /api/v1/account handlers
- `apps/engine/src/routes/bots.ts` - GET and POST /api/v1/bots handlers
- `apps/engine/src/server.ts` - Mounted route plugins, updated port/host config
- `apps/engine/tsconfig.json` - TypeScript config (created — was missing)
- `apps/engine/package.json` - Added jose, lru-cache, @types/node

## Decisions Made
- **adminDb for API routes**: The requireAuth middleware already verifies the user and resolves their account. Using adminDb with explicit `WHERE account_id = request.account.id` is simpler than the RLS client for these route handlers.
- **SUPABASE_URL at module load**: Throws on startup if missing, rather than failing at first request. Fail-fast is preferable for server startup.
- **PORT over ENGINE_PORT**: Railway injects `PORT`; `ENGINE_PORT` is the local dev fallback. Using `PORT || ENGINE_PORT || "4000"` ensures Railway compatibility without breaking local dev.
- **host "::"**: Required for Railway — binds to all interfaces including IPv6. Does not break local development.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created engine tsconfig.json (was missing)**
- **Found during:** Task 1 (TypeScript compile verification)
- **Issue:** Plan required `tsc --noEmit` verification but no tsconfig.json existed in apps/engine/
- **Fix:** Created tsconfig.json extending root tsconfig, following the same pattern as packages/db/tsconfig.json
- **Files modified:** apps/engine/tsconfig.json (created)
- **Verification:** `tsc --noEmit` runs and reports no errors
- **Committed in:** `2ccbe64` (Task 1 commit)

**2. [Rule 3 - Blocking] Added @types/node to engine devDependencies**
- **Found during:** Task 1 (first TypeScript compile attempt)
- **Issue:** tsconfig.json referenced `types: ["node"]` but @types/node was not installed in engine
- **Fix:** `pnpm --filter engine add -D @types/node`
- **Files modified:** apps/engine/package.json, pnpm-lock.yaml
- **Verification:** `tsc --noEmit` passes without TS2688 error
- **Committed in:** `2ccbe64` (Task 1 commit)

**3. [Rule 1 - Bug] Removed non-existent `timezone` field from PATCH /api/v1/account**
- **Found during:** Task 2 (account route implementation)
- **Issue:** Plan specified `{ businessName?, timezone? }` as updatable fields, but `accounts` table has no `timezone` column (it's in `calendar_configs`)
- **Fix:** Replaced with `{ businessName?, businessPhone?, businessType? }` — fields that actually exist on the accounts table
- **Files modified:** apps/engine/src/routes/account.ts
- **Verification:** TypeScript compile passes; no runtime error on valid requests
- **Committed in:** `0cb8774` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes were necessary for TypeScript compilation and runtime correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no new external services. Users still need the env vars documented in 01-01 and 01-02 SUMMARIES (SUPABASE_URL, DATABASE_URL, etc.). The engine requires `SUPABASE_URL` at startup for JWKS verification.

## Next Phase Readiness
- Authenticated API layer is complete — satisfies Phase 1 exit criterion "hit an authenticated API endpoint that returns account data"
- `requireAuth` pattern is established — future routes can copy the `{ onRequest: [requireAuth] }` pattern
- Engine now has tsconfig.json, ready for TypeScript-based builds
- Plans 01-03 and 01-05 can now be executed (WhatsApp connection management and environment config)

---
*Phase: 01-foundation*
*Completed: 2026-02-17*

## Self-Check: PASSED

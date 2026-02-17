# ZapBot — Project State

## Current Milestone: v1-mvp
**Status**: Executing Phase 1 — Plan 01 complete

## Phase Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Foundation — Database, Auth & Project Scaffold | In progress | 2/5 complete |
| 2 | Flow Editor — Visual Bot Builder | Not started | Not planned |
| 3 | WhatsApp Connection & Webhook | Not started | Not planned |
| 4 | Flow Execution Engine | Not started | Not planned |
| 5 | Google Calendar Scheduling | Not started | Not planned |
| 6 | Dashboard & Polish | Not started | Not planned |

## Progress (Phase 1 Plans)

```
Phase 1: ██░░░░░░░░ 2/5 plans (40%)
Overall: Very early — only Phase 1 planned
```

## Accumulated Decisions

| Decision | Made In | Rationale |
|----------|---------|-----------|
| drizzle-orm upgraded to ^0.45.0 | 01-01 | Existing schema uses array syntax (table) => [...] added in 0.36+ |
| drizzle-kit upgraded to ^0.31.0 | 01-01 | Required for entities.roles.provider config + compatible with drizzle-orm 0.45 |
| Separate postgres connections for adminDb and rlsDb | 01-01 | Prevents RLS context bleeding between concurrent requests |
| prepare: false on all postgres.js connections | 01-01 | Required for Supabase Transaction pooler (PgBouncer) — prevents "prepared statement already exists" |
| ENCRYPTION_KEY validated at call-time not startup | 01-01 | Allows @zapbot/db import without env var (useful in build/test) |
| AES-256-GCM storage format: base64(iv+authTag+ciphertext) | 01-01 | Standard GCM format, tamper-evident via auth tag |

## Blockers / Concerns

- User must create Supabase project and set DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY before running migrations
- User must generate ENCRYPTION_KEY (32-byte hex) and add to .env.local
- Next.js web app (01-02) is scaffolded but login/register pages are placeholder — need implementation in later plans

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 01-01-PLAN.md (database foundation)
Resume file: None — proceed with 01-03-PLAN.md next

---
*Updated: 2026-02-17*

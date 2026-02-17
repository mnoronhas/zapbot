# ZapBot — Project State

## Current Milestone: v1-mvp
**Status**: Executing Phase 1 — Plans 01 and 02 complete

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
Phase 1: ████░░░░░░ 2/5 plans (40%)
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
| Use @supabase/ssr (not auth-helpers) | 01-02 | auth-helpers deprecated; ssr is current standard for Next.js App Router |
| next.config.mjs not next.config.ts | 01-02 | Next.js 14.2 does not support TypeScript config files |
| DOM lib in web tsconfig | 01-02 | Root tsconfig is ES2022 only; browser app needs DOM types for window, etc. |
| No Tailwind in Phase 1 frontend | 01-02 | User: "focus on backend first" — inline styles only for Phase 1 UI |
| getUser() not getSession() in server-side code | 01-02 | getSession() doesn't verify JWT server-side — security requirement from research |

## Blockers / Concerns

- User must create Supabase project and set DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY before running migrations or the web app
- User must generate ENCRYPTION_KEY (32-byte hex) and add to .env.local
- Supabase account trigger (on_auth_user_created) must be created manually in Supabase Dashboard before user registration creates account rows — see RESEARCH.md Pattern 5
- Google OAuth must be enabled in Supabase Dashboard > Authentication > Providers

## Session Continuity

Last session: 2026-02-17T19:25:55Z
Stopped at: Completed 01-02-PLAN.md (Next.js frontend scaffold with Supabase Auth)
Resume file: None — proceed with 01-03-PLAN.md next

---
*Updated: 2026-02-17*

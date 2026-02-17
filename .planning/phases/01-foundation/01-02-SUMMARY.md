---
phase: 01-foundation
plan: "02"
subsystem: auth
tags: [nextjs, supabase, supabase-ssr, react, typescript, auth, oauth, google-oauth, middleware]

requires: []
provides:
  - "Next.js 14 App Router scaffold at apps/web/"
  - "Supabase browser client (createBrowserClient via @supabase/ssr)"
  - "Supabase server client (createServerClient via @supabase/ssr)"
  - "Next.js middleware with getUser() JWT verification"
  - "OAuth auth callback route (exchangeCodeForSession)"
  - "Login page with email/password + Google OAuth (PT-BR)"
  - "Register page with business name + email/password + Google OAuth (PT-BR)"
  - "Protected dashboard page with user info display"
  - "LogoutButton client component"
affects:
  - "02-flow-editor (needs web app scaffold for UI pages)"
  - "06-dashboard (extends dashboard page built here)"

tech-stack:
  added:
    - "next@14.2.35 — Next.js App Router framework"
    - "@supabase/ssr@0.5.x — SSR-safe Supabase client (NOT deprecated auth-helpers)"
    - "@supabase/supabase-js@2.x — Supabase JS client"
    - "react@18, react-dom@18 — React framework"
  patterns:
    - "Server Components by default, Client Components only for interactive auth forms"
    - "Browser client: createBrowserClient from @supabase/ssr"
    - "Server client: async createClient() with cookieStore getAll/setAll"
    - "Middleware: createServerClient with request cookies, getUser() for JWT verification"
    - "Never getSession() in server-side code — always getUser()"

key-files:
  created:
    - "zapbot-project/zapbot/apps/web/package.json"
    - "zapbot-project/zapbot/apps/web/next.config.mjs"
    - "zapbot-project/zapbot/apps/web/tsconfig.json"
    - "zapbot-project/zapbot/apps/web/src/lib/supabase/client.ts"
    - "zapbot-project/zapbot/apps/web/src/lib/supabase/server.ts"
    - "zapbot-project/zapbot/apps/web/src/middleware.ts"
    - "zapbot-project/zapbot/apps/web/src/app/layout.tsx"
    - "zapbot-project/zapbot/apps/web/src/app/page.tsx"
    - "zapbot-project/zapbot/apps/web/src/app/auth/callback/route.ts"
    - "zapbot-project/zapbot/apps/web/src/app/login/page.tsx"
    - "zapbot-project/zapbot/apps/web/src/app/register/page.tsx"
    - "zapbot-project/zapbot/apps/web/src/app/dashboard/page.tsx"
    - "zapbot-project/zapbot/apps/web/src/app/dashboard/LogoutButton.tsx"
  modified:
    - "zapbot-project/zapbot/pnpm-lock.yaml (198 new packages added)"

key-decisions:
  - "Used next.config.mjs instead of next.config.ts — Next.js 14.2 does not support TS config files"
  - "Added lib DOM+DOM.Iterable to web tsconfig — browser app needs DOM types, root tsconfig only has ES2022"
  - "Explicit CookieOptions type annotation on setAll parameter — @supabase/ssr requires this under strict mode"
  - "LogoutButton as separate client component in same dashboard folder — simplest approach for mixing server/client"
  - "Inline styles only (no Tailwind) — per user constraint: focus on backend first in Phase 1"

patterns-established:
  - "Pattern: all PT-BR UI text in Next.js pages; code/comments in English"
  - "Pattern: protected pages check getUser() and call redirect() server-side"
  - "Pattern: OAuth flows use window.location.origin as redirectTo base"
  - "Pattern: auth callback at /auth/callback handles both email confirm and OAuth code exchange"

duration: 14min
completed: "2026-02-17"
---

# Phase 1 Plan 02: Next.js Frontend Scaffold with Supabase Auth Summary

**Next.js 14 App Router with @supabase/ssr cookie-based auth: login (email + Google OAuth), register, protected dashboard, and session middleware using getUser() for server-side JWT verification — all UI in PT-BR**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-17T19:11:24Z
- **Completed:** 2026-02-17T19:25:55Z
- **Tasks:** 2/2
- **Files modified:** 13 created + 1 modified (lockfile)

## Accomplishments
- Created complete Next.js 14 App Router scaffold with Supabase SSR auth using the current @supabase/ssr package (not deprecated auth-helpers)
- Login page with email/password form and Google OAuth button; register page with business name field — both fully in PT-BR
- Session middleware using getUser() (NOT getSession()) for proper server-side JWT verification
- Auth callback route handles both Google OAuth code exchange and email confirmation links
- Protected dashboard page with server-side auth check, user info display, and logout functionality

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js app with Supabase client libraries** - `d3a1b17` (feat)
2. **Task 2: Create login, register, and dashboard pages** - `a21235c` (feat)

**Plan metadata:** committed with SUMMARY.md (docs)

## Files Created/Modified

- `apps/web/package.json` - @zapbot/web package with next, react, @supabase/ssr deps
- `apps/web/next.config.mjs` - Minimal Next.js config (mjs, not ts — Next.js 14 limitation)
- `apps/web/tsconfig.json` - Extends root tsconfig, adds DOM lib, @/* path alias, Next plugin
- `apps/web/src/lib/supabase/client.ts` - Browser client via createBrowserClient
- `apps/web/src/lib/supabase/server.ts` - Server client via createServerClient with cookie handling
- `apps/web/src/middleware.ts` - Session refresh + auth redirect using getUser()
- `apps/web/src/app/layout.tsx` - Root layout with lang="pt-BR" and PT-BR metadata
- `apps/web/src/app/page.tsx` - Root redirect: logged in → /dashboard, else → /login
- `apps/web/src/app/auth/callback/route.ts` - OAuth code exchange via exchangeCodeForSession
- `apps/web/src/app/login/page.tsx` - Email/password + Google OAuth login form (PT-BR, 175 lines)
- `apps/web/src/app/register/page.tsx` - Business name + email/password + Google registration (PT-BR, 220 lines)
- `apps/web/src/app/dashboard/page.tsx` - Protected server component showing user email + ID
- `apps/web/src/app/dashboard/LogoutButton.tsx` - Client component for signOut + redirect

## Decisions Made

- **next.config.mjs not .ts**: Next.js 14.2 does not support TypeScript config files. Used .mjs instead.
- **DOM lib in web tsconfig**: Root tsconfig only specifies ES2022 lib. Browser app needs DOM types for `window`, `document`, etc.
- **Explicit CookieOptions type**: @supabase/ssr's setAll parameter requires explicit typing under strict TypeScript — implicit any causes build failure.
- **No Tailwind in Phase 1**: Per user constraint ("focus on backend first"), using minimal inline styles only.
- **LogoutButton as separate file**: Dashboard is a Server Component; logout requires client-side Supabase call. Separate LogoutButton.tsx client component is the cleanest approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] next.config.ts → next.config.mjs**
- **Found during:** Task 1 (first build attempt)
- **Issue:** Next.js 14.2 threw "Configuring Next.js via 'next.config.ts' is not supported" error
- **Fix:** Renamed to next.config.mjs and converted to ESM module syntax
- **Files modified:** apps/web/next.config.mjs (created), next.config.ts (deleted)
- **Verification:** Build succeeded after rename
- **Committed in:** d3a1b17 (Task 1 commit)

**2. [Rule 1 - Bug] Explicit CookieOptions types in server.ts and middleware.ts**
- **Found during:** Task 1 (second build attempt)
- **Issue:** TypeScript strict mode: "Parameter 'cookiesToSet' implicitly has an 'any' type" in both server.ts and middleware.ts
- **Fix:** Added `type CookieOptions` import from @supabase/ssr and explicit parameter type annotation
- **Files modified:** apps/web/src/lib/supabase/server.ts, apps/web/src/middleware.ts
- **Verification:** Build succeeded after adding types
- **Committed in:** d3a1b17 (Task 1 commit)

**3. [Rule 1 - Bug] Added DOM lib to web tsconfig**
- **Found during:** Task 2 (first build attempt after adding login page)
- **Issue:** TypeScript: "Cannot find name 'window'" — root tsconfig only has ES2022 lib, no DOM
- **Fix:** Added `"lib": ["ES2022", "DOM", "DOM.Iterable"]` to apps/web/tsconfig.json
- **Files modified:** apps/web/tsconfig.json
- **Verification:** Build succeeded with all 6 routes after adding DOM lib
- **Committed in:** a21235c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking config issue, 2 TypeScript type fixes)
**Impact on plan:** All auto-fixes required for build to succeed. No scope creep. The config file extension issue is a known Next.js 14 limitation; the TypeScript fixes were caused by strict mode + missing DOM lib in the shared tsconfig.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

To run the web app, the following environment variables must be set in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These come from the Supabase Dashboard > Project Settings > API.

For Google OAuth to work:
1. Enable Google provider in Supabase Dashboard > Authentication > Providers
2. Add `{SUPABASE_URL}/auth/v1/callback` to Google OAuth authorized redirect URIs

## Next Phase Readiness

- apps/web/ scaffold is complete and buildable
- Auth pages are functional pending real Supabase credentials
- pnpm install and pnpm --filter web build both succeed
- Ready for Plan 01-03 (if it exists) or Phase 2 flow editor work

Remaining Phase 1 concern: The Supabase database trigger for account creation (on_auth_user_created) must be set up manually in the Supabase Dashboard before registration will fully work end-to-end (see RESEARCH.md Pattern 5).

---
*Phase: 01-foundation*
*Completed: 2026-02-17*

## Self-Check: PASSED

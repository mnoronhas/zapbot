# Technology Stack

**Analysis Date:** 2026-02-17

## Languages

**Primary:**
- TypeScript ^5.5.0 - All backend, shared packages, and planned frontend code
- Target: ES2022 with strict mode enabled

**Secondary:**
- JSX/React (JavaScript) - Root-level prototype file `ZapBot_Editor_Prototype.jsx` (standalone visual editor prototype, not part of the monorepo build)

## Runtime

**Environment:**
- Node.js >= 20.0.0 (enforced via `engines` in root `zapbot-project/zapbot/package.json`)
- ESM modules (`"type": "module"` in `@zapbot/engine`)

**Package Manager:**
- pnpm 9.15.0 (enforced via `packageManager` field in root `zapbot-project/zapbot/package.json`)
- Lockfile: **missing** — `pnpm-lock.yaml` does not exist yet; run `pnpm install` to generate

## Frameworks

**Core:**
- Fastify ^5.0.0 - HTTP server for the bot engine (`apps/engine`), handles WhatsApp webhooks and REST API
- @fastify/cors ^10.0.0 - CORS middleware, configured for `APP_URL` origin
- Next.js 14 (App Router) - **planned** for frontend (`apps/web`), not yet scaffolded

**Testing:**
- Vitest ^2.0.0 - Unit test runner for `@zapbot/engine`, `@zapbot/whatsapp`, `@zapbot/calendar`, `@zapbot/flow-schema`

**Build/Dev:**
- Turborepo (turbo.json at monorepo root) - Build orchestration, task running (`dev`, `build`, `test`, `lint`, `clean`)
- tsx ^4.19.0 - TypeScript execution for development (`tsx watch src/server.ts` in engine)
- tsc (TypeScript compiler) - Production builds via `tsc` in each package

## Monorepo Structure

**Workspace Configuration:**
- File: `zapbot-project/zapbot/pnpm-workspace.yaml`
- Workspace paths: `apps/*`, `packages/*`

**Packages (internal):**
| Package | Path | Purpose |
|---------|------|---------|
| `@zapbot/engine` | `zapbot-project/zapbot/apps/engine/` | Bot runtime server (Fastify), WhatsApp webhook handler |
| `@zapbot/flow-schema` | `zapbot-project/zapbot/packages/flow-schema/` | Shared Zod schemas for the flow JSON contract |
| `@zapbot/whatsapp` | `zapbot-project/zapbot/packages/whatsapp/` | WhatsApp Cloud API client (send/receive messages) |
| `@zapbot/calendar` | `zapbot-project/zapbot/packages/calendar/` | Google Calendar API client (OAuth, availability, booking) |
| `@zapbot/db` | `zapbot-project/zapbot/packages/db/` | Drizzle ORM schema definitions and migrations (PostgreSQL) |

**Inter-package Dependencies:**
- `@zapbot/engine` depends on all four packages (`workspace:*`)
- All other packages are standalone (no cross-package dependencies among them)

**Turborepo Tasks** (defined in `zapbot-project/zapbot/turbo.json`):
- `build` - Depends on upstream builds, outputs `dist/**` and `.next/**`
- `dev` - No cache, persistent (watch mode)
- `test` - Depends on upstream builds
- `lint` - Depends on upstream builds
- `clean` - No cache

## Key Dependencies

**Critical:**
- `zod` ^3.23.0 - Runtime validation and type inference for flow schemas; used in `@zapbot/flow-schema`, `@zapbot/whatsapp`, `@zapbot/engine`
- `fastify` ^5.0.0 - Core HTTP framework for the engine app
- `drizzle-orm` ^0.33.0 - ORM for PostgreSQL; used in `@zapbot/db` and `@zapbot/engine`
- `postgres` ^3.4.0 - PostgreSQL driver (postgres.js); used with Drizzle in `@zapbot/db` and `@zapbot/engine`
- `googleapis` ^140.0.0 - Google Calendar API SDK; used in `@zapbot/calendar`

**Infrastructure:**
- `dotenv` ^16.4.0 - Environment variable loading in `@zapbot/engine`
- `drizzle-kit` ^0.24.0 - Migration generation and Drizzle Studio; dev dependency in `@zapbot/db`

**Planned (referenced in CLAUDE.md but not yet in package.json):**
- Next.js 14 - Frontend app (`apps/web` not yet scaffolded)
- Tailwind CSS - Frontend styling
- @dnd-kit/core + @dnd-kit/sortable - Drag-and-drop for visual flow editor
- Zustand - Client-side state management
- Supabase client SDK - Auth and database access from frontend
- Playwright - E2E testing

## Database

**Provider:** PostgreSQL via Supabase (hosted)
**ORM:** Drizzle ORM ^0.33.0
**Driver:** postgres.js ^3.4.0
**Migration Tool:** drizzle-kit ^0.24.0

**Schema location:** `zapbot-project/zapbot/packages/db/src/schema/index.ts`

**Tables defined:**
- `accounts` - Multi-tenant accounts with Supabase user ID linkage
- `whatsapp_connections` - WhatsApp Business API credentials per account
- `bots` - Bot definitions with flow JSON (JSONB)
- `bot_versions` - Version history for rollback
- `calendar_configs` - Google Calendar OAuth tokens and schedule config
- `conversations` - Active/completed chat sessions with state (JSONB variables)
- `messages` - Individual message log per conversation
- `appointments` - Booked appointments with Google Calendar event IDs
- `analytics_events` - Lightweight event tracking

**Database Scripts (root package.json):**
```bash
pnpm db:migrate    # pnpm --filter @zapbot/db migrate (drizzle-kit migrate)
pnpm db:generate   # pnpm --filter @zapbot/db generate (drizzle-kit generate)
pnpm db:studio     # pnpm --filter @zapbot/db studio (Drizzle Studio GUI)
```

**Note:** No `drizzle.config.ts` file exists yet in the `@zapbot/db` package. This needs to be created before migrations can run.

## TypeScript Configuration

**Root tsconfig** (`zapbot-project/zapbot/tsconfig.json`):
- Target: ES2022
- Module: ESNext
- Module resolution: bundler
- Strict mode: enabled
- Source maps and declaration maps: enabled
- Isolated modules: enabled

**Per-package tsconfigs:** Not yet created. Each package currently references types via `"main": "./src/index.ts"` and `"types": "./src/index.ts"` (source-level resolution, no build step for library packages during development).

## Configuration

**Environment:**
- `.env.example` exists at `zapbot-project/zapbot/.env.example` (template for required variables)
- Runtime loading via `dotenv/config` import in engine server
- Turbo watches `**/.env.*local` as global dependencies

**Build:**
- `zapbot-project/zapbot/turbo.json` - Turborepo pipeline
- `zapbot-project/zapbot/tsconfig.json` - Root TypeScript config
- No ESLint, Prettier, or other linting/formatting configs exist yet

## Platform Requirements

**Development:**
- Node.js >= 20.0.0
- pnpm 9.15.0
- PostgreSQL (via Supabase free tier)
- ngrok (for WhatsApp webhook testing over HTTPS)

**Production (planned):**
- Frontend: Vercel (via Git integration with Next.js)
- Engine: Docker on Railway or Oracle Cloud
- Database: Supabase PostgreSQL (free tier: 500MB database, 2GB storage)

**Not Yet Set Up:**
- No `infra/` directory exists (planned for Docker/deploy configs)
- No CI/CD pipeline configured
- No Dockerfile exists

---

*Stack analysis: 2026-02-17*

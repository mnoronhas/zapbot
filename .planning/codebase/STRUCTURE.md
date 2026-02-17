# Codebase Structure

**Analysis Date:** 2026-02-17

## Directory Layout

```
Zapbot/                                          # Git root
├── CLAUDE.md                                    # Top-level Claude instructions
├── ZapBot_Editor_Prototype.jsx                  # Standalone React prototype (~700 lines)
├── ZapBot_PRD_MVP_v1.docx                       # Product requirements document
├── .planning/                                   # GSD planning documents
│   └── codebase/                                # Codebase analysis docs (this file)
└── zapbot-project/
    └── zapbot/                                  # Monorepo root
        ├── package.json                         # Root workspace config (pnpm + turbo scripts)
        ├── pnpm-workspace.yaml                  # Workspace definition (apps/*, packages/*)
        ├── turbo.json                           # Turborepo build orchestration config
        ├── tsconfig.json                        # Base TypeScript config (ES2022, strict)
        ├── .gitignore                           # Standard ignores + Supabase temp
        ├── .env.example                         # Environment variable template
        ├── CLAUDE.md                            # Detailed project intelligence doc
        ├── apps/
        │   └── engine/                          # @zapbot/engine — Bot runtime (Fastify)
        │       ├── package.json                 # Dependencies + scripts
        │       └── src/
        │           ├── server.ts                # Fastify entry point (health, webhooks)
        │           └── services/
        │               └── flow-engine.ts       # FlowEngine class — the bot brain
        ├── packages/
        │   ├── flow-schema/                     # @zapbot/flow-schema — Flow JSON contract
        │   │   ├── package.json                 # zod dependency
        │   │   └── src/
        │   │       └── index.ts                 # Zod schemas, validation, analysis, templates
        │   ├── whatsapp/                        # @zapbot/whatsapp — WhatsApp Cloud API client
        │   │   ├── package.json                 # zod dependency
        │   │   └── src/
        │   │       └── index.ts                 # WhatsAppClient class, message parsing, types
        │   ├── calendar/                        # @zapbot/calendar — Google Calendar integration
        │   │   ├── package.json                 # googleapis dependency
        │   │   └── src/
        │   │       └── index.ts                 # OAuth, availability calc, booking CRUD
        │   └── db/                              # @zapbot/db — Database schemas
        │       ├── package.json                 # drizzle-orm, postgres, drizzle-kit
        │       └── src/
        │           ├── index.ts                 # Re-exports from schema/
        │           └── schema/
        │               └── index.ts             # All Drizzle table definitions + enums
        └── docs/
            ├── DAY1_QUICKSTART.md               # Setup guide + first week sprint plan
            └── GOOGLE_CALENDAR_SETUP.md         # Google Cloud Console setup instructions
```

### Planned Directories (not yet created)

The monorepo contains scaffold directories (literal `{` in directory names) outlining the planned structure:

```
zapbot/
├── apps/
│   └── web/                                     # Next.js 14 frontend (App Router)
│       └── src/
│           ├── app/                             # Next.js App Router pages
│           ├── components/
│           │   ├── editor/                      # Visual flow editor components
│           │   ├── simulator/                   # Phone simulator component
│           │   ├── dashboard/                   # Analytics dashboard
│           │   ├── onboarding/                  # Setup wizard
│           │   └── shared/                      # Shared UI components
│           ├── lib/                             # Utility libraries
│           ├── hooks/                           # Custom React hooks
│           ├── types/                           # TypeScript type definitions
│           └── styles/                          # Global styles
├── infra/
│   ├── docker/                                  # Dockerfiles
│   └── scripts/                                 # Deploy scripts
```

## Directory Purposes

**`zapbot-project/zapbot/` (monorepo root):**
- Purpose: Contains all workspace configuration, workspace packages, and documentation
- Key files: `package.json` (workspace scripts), `pnpm-workspace.yaml` (workspace topology), `turbo.json` (build pipeline), `tsconfig.json` (shared TS config), `CLAUDE.md` (comprehensive project context)

**`zapbot-project/zapbot/apps/engine/`:**
- Purpose: The bot runtime application -- receives WhatsApp webhooks, processes messages through the flow engine, sends responses
- Package name: `@zapbot/engine`
- Contains: Fastify HTTP server, flow engine service
- Key files:
  - `src/server.ts` -- Main entry point. Fastify server with health check at `/health`, webhook verification at `GET /webhooks/whatsapp`, message processing at `POST /webhooks/whatsapp`
  - `src/services/flow-engine.ts` -- `FlowEngine` class. Takes a `BotFlow` + `ParsedMessage` + `ConversationState`, produces `EngineOutput` (outgoing messages + side effects)

**`zapbot-project/zapbot/packages/flow-schema/`:**
- Purpose: The shared flow JSON contract between frontend editor and backend engine
- Package name: `@zapbot/flow-schema`
- Contains: Zod schemas defining all node types, validation functions, flow analysis, clinic template factory
- Key files:
  - `src/index.ts` -- All exports: `BotFlow`, `FlowNode`, `FlowOption`, `ListSection`, `AppointmentConfig`, `ConditionRule`, `NodeType`, `FieldType`, `validateFlow()`, `analyzeFlow()`, `createClinicTemplate()`

**`zapbot-project/zapbot/packages/whatsapp/`:**
- Purpose: WhatsApp Cloud API client for sending/receiving messages
- Package name: `@zapbot/whatsapp`
- Contains: HTTP client class, webhook parsing, message types
- Key files:
  - `src/index.ts` -- `WhatsAppClient` class (sendText, sendButtons, sendList, sendTemplate, markAsRead, verifyWebhookSignature, handleVerifyChallenge, parseIncomingMessage), `ParsedMessage` type, `WhatsAppApiError` class

**`zapbot-project/zapbot/packages/calendar/`:**
- Purpose: Google Calendar API integration for appointment scheduling
- Package name: `@zapbot/calendar`
- Contains: OAuth helpers, calendar CRUD, availability algorithm
- Key files:
  - `src/index.ts` -- OAuth functions (getAuthUrl, exchangeCode, refreshAccessToken), calendar operations (listCalendars, getBusySlots, createEvent, deleteEvent), availability calculator (calculateAvailability, generatePossibleSlots)

**`zapbot-project/zapbot/packages/db/`:**
- Purpose: Database schema definitions using Drizzle ORM
- Package name: `@zapbot/db`
- Contains: PostgreSQL table definitions, enum types, indexes
- Key files:
  - `src/index.ts` -- Barrel export from `./schema/index`
  - `src/schema/index.ts` -- 8 tables: `accounts`, `whatsappConnections`, `bots`, `botVersions`, `calendarConfigs`, `conversations`, `messages`, `appointments`, `analyticsEvents`. 7 enums: `planEnum`, `accountStatusEnum`, `botStatusEnum`, `conversationStatusEnum`, `messageDirectionEnum`, `appointmentStatusEnum`, `waConnectionStatusEnum`

**`zapbot-project/zapbot/docs/`:**
- Purpose: Setup guides and onboarding documentation
- Key files:
  - `DAY1_QUICKSTART.md` -- Environment setup checklist, first week sprint plan, architecture diagram
  - `GOOGLE_CALENDAR_SETUP.md` -- Step-by-step Google Cloud Console OAuth setup

## Key File Locations

**Entry Points:**
- `zapbot-project/zapbot/apps/engine/src/server.ts`: Engine HTTP server entry point (Fastify, port 4000)
- `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`: Flow execution engine (`FlowEngine` class)

**Configuration:**
- `zapbot-project/zapbot/package.json`: Root workspace scripts (dev, build, test, lint, db:migrate, db:generate, db:studio, clean)
- `zapbot-project/zapbot/pnpm-workspace.yaml`: Workspace topology (`apps/*`, `packages/*`)
- `zapbot-project/zapbot/turbo.json`: Turborepo pipeline (build depends on ^build, dev is persistent, test depends on ^build)
- `zapbot-project/zapbot/tsconfig.json`: Base TypeScript config (ES2022, ESNext modules, strict, bundler resolution)
- `zapbot-project/zapbot/.env.example`: All required environment variables (Supabase, WhatsApp, Google, encryption, app URLs)
- `zapbot-project/zapbot/.gitignore`: Standard ignores (node_modules, dist, .next, .env, coverage, supabase temp)

**Core Logic:**
- `zapbot-project/zapbot/packages/flow-schema/src/index.ts`: Flow JSON Zod schemas + validation + analysis + template factory
- `zapbot-project/zapbot/packages/whatsapp/src/index.ts`: WhatsApp Cloud API client + message parsing
- `zapbot-project/zapbot/packages/calendar/src/index.ts`: Google Calendar OAuth + availability algorithm + booking
- `zapbot-project/zapbot/packages/db/src/schema/index.ts`: All Drizzle table definitions

**Documentation:**
- `CLAUDE.md` (root): Top-level Claude instructions
- `zapbot-project/zapbot/CLAUDE.md`: Comprehensive project intelligence (architecture, conventions, schema, integrations, gotchas)
- `zapbot-project/zapbot/docs/DAY1_QUICKSTART.md`: Setup guide
- `zapbot-project/zapbot/docs/GOOGLE_CALENDAR_SETUP.md`: Google Calendar OAuth setup

**Prototypes:**
- `ZapBot_Editor_Prototype.jsx`: Standalone React component demonstrating the flow editor UI + phone simulator. Contains `PhoneSimulator`, `BlockCard`, and `ZapBotEditor` components. Uses inline styles with a dark theme. This is a UI prototype, not production code.

## Naming Conventions

**Files:**
- Package source: Single `index.ts` barrel export per package (e.g., `packages/flow-schema/src/index.ts`)
- Services: `kebab-case.ts` (e.g., `flow-engine.ts`)
- Server entry: `server.ts`

**Directories:**
- Packages: `kebab-case` (e.g., `flow-schema`, `flow-schema`)
- Apps: `lowercase` (e.g., `engine`, `web`)
- Source subdirs: `lowercase` (e.g., `services`, `schema`)

**Package Names:**
- Scoped under `@zapbot/` (e.g., `@zapbot/engine`, `@zapbot/flow-schema`, `@zapbot/whatsapp`, `@zapbot/calendar`, `@zapbot/db`)
- All packages are `private: true`

**Planned naming (from CLAUDE.md):**
- React components: `PascalCase.tsx` (e.g., `BlockCard.tsx`, `PhoneSimulator.tsx`)
- Utilities/hooks: `camelCase.ts` (e.g., `useFlowEditor.ts`, `parseFlow.ts`)
- Type files: `camelCase.types.ts` (e.g., `flow.types.ts`)
- API routes: `route.ts` inside folder (Next.js App Router convention)
- Fastify routes: `kebab-case.ts` (e.g., `webhook-handler.ts`)

## Where to Add New Code

**New Fastify Route:**
- Create route handler in: `zapbot-project/zapbot/apps/engine/src/routes/{resource-name}.ts`
- Register in: `zapbot-project/zapbot/apps/engine/src/server.ts` via `app.register()`
- Use prefix: `/api/v1/{resource}`
- Planned routes (from `server.ts` comments): bots, conversations, appointments, analytics

**New Flow Node Type:**
- Add to `NodeType` enum in: `zapbot-project/zapbot/packages/flow-schema/src/index.ts` (line 7)
- Add type-specific fields to `FlowNode` schema (line 71)
- Add refinement validation (line 95)
- Handle in `FlowEngine.executeNode()`: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts` (line 117)
- Handle in `FlowEngine.resolveNextNode()` (line 226)

**New Database Table:**
- Add table definition in: `zapbot-project/zapbot/packages/db/src/schema/index.ts`
- Include `account_id` foreign key for multi-tenancy
- Include `id` (UUID), `created_at`, `updated_at` columns
- Add appropriate indexes
- Generate migration: `pnpm db:generate`
- Run migration: `pnpm db:migrate`

**New WhatsApp Message Type:**
- Add to `IncomingMessage.type` union in: `zapbot-project/zapbot/packages/whatsapp/src/index.ts` (line 39)
- Add parsing case in `WhatsAppClient.parseIncomingMessage()` (line 193)
- Extend `ParsedMessage` type if needed (line 277)

**New Calendar Operation:**
- Add function in: `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Use `calendarFetch()` helper for authenticated API calls (line 144)

**New React Component (when web app is created):**
- Component file: `zapbot-project/zapbot/apps/web/src/components/{category}/{ComponentName}.tsx`
- Categories: `editor/`, `simulator/`, `dashboard/`, `onboarding/`, `shared/`
- Hooks: `zapbot-project/zapbot/apps/web/src/hooks/use{HookName}.ts`
- Types: `zapbot-project/zapbot/apps/web/src/types/{name}.types.ts`

**New Shared Package:**
- Create directory: `zapbot-project/zapbot/packages/{package-name}/`
- Add `package.json` with name `@zapbot/{package-name}`, `private: true`, `main: "./src/index.ts"`, `types: "./src/index.ts"`
- Create `src/index.ts` as barrel export
- Automatically picked up by pnpm workspace (`packages/*` glob)

**Tests:**
- Co-located with source or in a sibling `__tests__/` directory
- Use Vitest (configured in each package's `package.json`)
- Run single package: `pnpm --filter @zapbot/{package} test`
- Run all: `pnpm test`

## Monorepo Organization

**Package Manager:** pnpm 9.15.0 with workspaces
- Workspace definition: `zapbot-project/zapbot/pnpm-workspace.yaml`
- Topology: `apps/*` and `packages/*`
- Internal dependencies use `workspace:*` protocol (e.g., `"@zapbot/flow-schema": "workspace:*"`)

**Build Orchestration:** Turborepo
- Config: `zapbot-project/zapbot/turbo.json`
- `build` task: Depends on all upstream builds (`^build`), outputs `dist/**` and `.next/**`
- `dev` task: No caching, persistent (keeps running)
- `test` task: Depends on upstream builds (`^build`)
- `lint` task: Depends on upstream builds (`^build`)
- `clean` task: No caching

**Root Scripts (in `zapbot-project/zapbot/package.json`):**
- `pnpm dev` -- Start all apps in dev mode (via turbo)
- `pnpm build` -- Build all packages and apps
- `pnpm test` -- Run tests across all packages
- `pnpm lint` -- Lint all packages
- `pnpm format` -- Prettier format all TS/JS/JSON/MD files
- `pnpm db:migrate` -- Run database migrations
- `pnpm db:generate` -- Generate migrations from schema changes
- `pnpm db:studio` -- Open Drizzle Studio for DB browsing
- `pnpm clean` -- Remove all turbo caches and node_modules

**Node Requirements:** `>=20.0.0` (specified in root `package.json` engines)

## Special Directories

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: Yes (by GSD tooling)
- Committed: Yes

**`zapbot-project/zapbot/docs/`:**
- Purpose: Setup guides, architecture documentation
- Generated: No (manually authored)
- Committed: Yes

**`zapbot-project/zapbot/{apps/`:**
- Purpose: Empty scaffold directories showing planned project structure (literal curly braces in directory names -- this appears to be a planning artifact)
- Generated: No
- Committed: Yes but contains no source files
- Note: This should eventually be removed once the actual `apps/web/` directory is created

**`dist/` (per package, not yet generated):**
- Purpose: TypeScript compilation output
- Generated: Yes (by `tsc`)
- Committed: No (in `.gitignore`)

**`node_modules/` (per package + root):**
- Purpose: Package dependencies (managed by pnpm)
- Generated: Yes
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-02-17*

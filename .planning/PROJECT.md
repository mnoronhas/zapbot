# ZapBot — Project Context

## Vision
ZapBot is a general-purpose WhatsApp chatbot builder platform. Small business owners (non-technical) use a visual flow editor to create automated WhatsApp conversations — scheduling appointments, answering FAQs, collecting data, routing to human agents, and more — without writing code.

## Target Users
- **Primary**: Small business owners, receptionists, office managers (non-technical)
- **Use cases**: Healthcare clinics, salons, consultants, lawyers, dentists, service businesses
- **Key trait**: They need a simple, intuitive interface — no coding knowledge assumed

## Business Model
- **SaaS (multi-tenant)**: Multiple businesses sign up, each manages their own bots
- **Auth**: Supabase Auth (Google OAuth + email/password) — already designed in the DB schema
- **Language**: Portuguese (BR) only for MVP

## MVP Scope (v1)
Full end-to-end flow: **Visual Editor + WhatsApp Engine + Appointment Scheduling**

### Flow Block Types (MVP)
1. **Mensagem** (Message) — Send text messages
2. **Botoes** (Buttons) — Present button options
3. **Coletar Dado** (Collect Data) — Ask for and store user input
4. **Agendar** (Appointment) — Schedule via Google Calendar
5. **Condicao** (Condition) — If/then branching
6. **Transferir** (Handoff) — Route to human agent

### Core Features (MVP)
- Visual drag-and-drop flow editor (React-based, prototype exists)
- WhatsApp Business API integration (send/receive messages)
- Google Calendar integration (availability checking, event creation)
- Phone simulator for testing flows before publishing
- Basic analytics dashboard (conversations, appointments, drop-off)
- Multi-tenant account system with Supabase Auth
- Flow publish/pause/draft lifecycle

## Timeline
- **Approach**: Prototype speed — get core functionality running ASAP, polish later
- **Strategy**: Build incrementally, ship fast, iterate

## Existing Codebase
TypeScript monorepo in `zapbot-project/zapbot/` using pnpm workspaces + Turborepo:

| Package | Role | Status |
|---------|------|--------|
| `apps/engine` | Fastify server, webhook handler, flow execution | Scaffold with basic routing |
| `packages/whatsapp` | WhatsApp Business API client | Functional — send messages, buttons, webhook verification |
| `packages/calendar` | Google Calendar OAuth + availability | Functional — OAuth flow, busy slots, event CRUD |
| `packages/db` | Drizzle ORM + Supabase schema | Complete schema — accounts, bots, flows, appointments, connections |
| `packages/flow-schema` | Flow type definitions (Zod) | Type definitions for flow nodes and schema |

Additional assets:
- `ZapBot_Editor_Prototype.jsx` — Full React visual editor prototype with phone simulator
- `ZapBot_PRD_MVP_v1.docx` — Product Requirements Document

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Backend**: Fastify
- **Database**: PostgreSQL (Supabase) + Drizzle ORM
- **Frontend**: React (stack TBD — prototype is standalone JSX)
- **Monorepo**: pnpm workspaces + Turborepo
- **APIs**: WhatsApp Business API, Google Calendar API
- **Auth**: Supabase Auth (planned)

## Key Technical Decisions
- Supabase for auth + database (already committed in schema)
- Drizzle ORM for type-safe queries
- Flow-schema package defines the bot conversation graph (Zod-validated)
- WhatsApp client is class-based with full Cloud API support
- Calendar uses Google OAuth with refresh token rotation

## Known Gaps (from codebase analysis)
- No encryption implementation for stored tokens (schema has `_encrypted` columns but no encrypt/decrypt code)
- No webhook signature verification wired up in the server
- No auth middleware on API routes
- No test suite exists
- Flow engine is a scaffold — core execution loop not implemented
- Frontend stack not decided (prototype is standalone, needs proper app shell)
- No deployment/infrastructure setup

---
*Generated: 2026-02-17*

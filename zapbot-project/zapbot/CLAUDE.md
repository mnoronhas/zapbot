# CLAUDE.md — ZapBot Project Intelligence

## Project Overview

ZapBot is a no-code WhatsApp chatbot builder for Brazilian SMBs. Users visually design conversation flows and deploy them directly to their WhatsApp Business number. The MVP targets medical/dental clinics with appointment scheduling as the killer feature.

**Business context:** Bootstrap startup, 3 co-founders (all employed elsewhere). Speed and cost-efficiency are critical. Ship MVP in 6 weeks.

**Language:** The UI and all user-facing text is in Brazilian Portuguese (pt-BR). Code, comments, and documentation are in English.

## Architecture

```
zapbot/
├── apps/
│   ├── web/              # Next.js 14 frontend (App Router)
│   └── engine/           # Fastify bot runtime + WhatsApp webhook
├── packages/
│   ├── flow-schema/      # Shared flow JSON types, validation, Zod schemas
│   ├── whatsapp/         # WhatsApp Cloud API client
│   ├── calendar/         # Google Calendar API client
│   └── db/               # Drizzle ORM schemas + migrations (PostgreSQL)
├── infra/                # Docker, deploy configs
└── docs/                 # Architecture docs, API specs
```

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS | Use Server Components by default, Client Components only when needed |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | For the visual flow editor |
| State | Zustand | Simple, lightweight — no Redux |
| Backend | Fastify + TypeScript | Prefer Fastify plugins for modularity |
| Database | PostgreSQL via Supabase | Use Drizzle ORM, NOT Prisma (lighter, better edge support) |
| Auth | Supabase Auth (Google OAuth + email) | Also used for Google Calendar token storage |
| WhatsApp | Cloud API (direct, no BSP) | Already have approved Meta Business account |
| Calendar | Google Calendar API v3 | OAuth consent screen needs verification for >100 users |
| Validation | Zod | Shared schemas in flow-schema package |
| Monorepo | Turborepo | For build orchestration |
| Package Manager | pnpm | Workspaces enabled |

### Key Design Decisions

1. **Flow JSON is the contract** — The visual editor produces a JSON document. The bot runtime consumes it. They never share code, only the schema (in `packages/flow-schema`).

2. **Multi-tenant with Row-Level Security** — Every table has `account_id`. Supabase RLS policies enforce isolation. Never query without filtering by account.

3. **WhatsApp messages are stateless** — Each incoming webhook triggers a lookup: find conversation → find current node → execute node → send response → save state. No in-memory state.

4. **Optimistic locking for appointments** — When displaying available slots, we don't lock them. If two patients book the same slot simultaneously, the second gets an apology and re-shown availability.

5. **All dates in UTC** — Store everything in UTC. Convert to user's timezone (São Paulo by default: America/Sao_Paulo) only in the frontend.

## Code Conventions

### TypeScript

- Strict mode always (`"strict": true`)
- Prefer `type` over `interface` unless extending
- Use Zod for runtime validation, infer types from schemas
- No `any` — use `unknown` and narrow
- Prefer named exports over default exports (except Next.js pages)

### File Naming

- Components: `PascalCase.tsx` (e.g., `BlockCard.tsx`, `PhoneSimulator.tsx`)
- Utilities/hooks: `camelCase.ts` (e.g., `useFlowEditor.ts`, `parseFlow.ts`)
- Types: `camelCase.types.ts` (e.g., `flow.types.ts`)
- API routes: `route.ts` inside folder (Next.js App Router convention)
- Fastify routes: `kebab-case.ts` (e.g., `webhook-handler.ts`)

### Database

- Table names: `snake_case`, plural (e.g., `accounts`, `bots`, `conversations`)
- Column names: `snake_case` (e.g., `account_id`, `created_at`)
- Always include: `id` (UUID), `created_at`, `updated_at`
- Foreign keys: `{table_singular}_id` (e.g., `bot_id`, `account_id`)
- Use Drizzle schema definitions in `packages/db/src/schema/`

### API Design

- RESTful for CRUD operations
- Webhook endpoint: `POST /webhooks/whatsapp` (for Meta webhook verification and messages)
- Internal API prefix: `/api/v1/`
- Always validate request bodies with Zod
- Return consistent error format: `{ error: string, code: string, details?: unknown }`

## Shared Flow JSON Schema

This is the most important data structure in the system. It lives in `packages/flow-schema/`.

```typescript
// Core node types
type NodeType = "message" | "buttons" | "list" | "collect" | "appointment" | "condition" | "handoff" | "wait";

// A single node in the flow
type FlowNode = {
  id: string;                    // Unique within flow, e.g., "welcome", "menu_1"
  type: NodeType;
  content: string;               // The message text (supports {variable} interpolation)
  next?: string;                 // Default next node ID
  options?: FlowOption[];        // For buttons/list types
  field?: string;                // For collect type — variable name to store
  fieldType?: "text" | "phone" | "cpf" | "date" | "email";  // For collect — validation
  config?: AppointmentConfig;    // For appointment type
  condition?: ConditionRule;     // For condition type
  waitSeconds?: number;          // For wait type
  metadata?: Record<string, unknown>;
};

type FlowOption = {
  label: string;                 // Button/list item text
  value: string;                 // Internal value
  next: string;                  // Node ID to go to
};

type AppointmentConfig = {
  durationRules: Record<string, number>;  // e.g., { "first": 90, "return": 60 }
  sourceField: string;                     // Variable that determines which rule
  bufferMinutes?: number;                  // Default: 15
  maxAdvanceDays?: number;                 // Default: 60
  professionalSelection?: "manual" | "auto";
};

type ConditionRule = {
  field: string;                // Variable to check
  operator: "equals" | "contains" | "exists";
  value?: string;
  thenNext: string;             // Node ID if true
  elseNext: string;             // Node ID if false
};

// The complete flow document
type BotFlow = {
  version: number;              // Schema version (start at 1)
  startNodeId: string;          // Entry point
  nodes: FlowNode[];
};
```

## WhatsApp Cloud API Integration

### Webhook Verification (GET)
Meta sends a GET request to verify the webhook URL. Respond with the `hub.challenge` value.

### Incoming Messages (POST)
All messages arrive as POST to the webhook. Key message types to handle:
- `text` — Free text input (for collect blocks)
- `interactive.button_reply` — User tapped a button
- `interactive.list_reply` — User selected from a list
- `flow` — WhatsApp Flow completion (for structured forms)

### Outgoing Messages
Use the Messages API to send:
- `text` — Plain text messages
- `interactive.buttons` — Up to 3 buttons
- `interactive.list` — Up to 10 items in sections
- `template` — For 24h+ window messages (reminders)

### Rate Limits
- 80 messages/second for phone number
- 1,000 unique recipients/24h on unverified numbers (increases with quality rating)

### Important: Message Templates
For appointment reminders (sent >24h after last user message), you MUST use pre-approved message templates. Register these in Meta Business Manager:
- `appointment_reminder` — 24h before appointment
- `appointment_confirmation` — After booking

## Google Calendar Integration

### OAuth Flow
1. User clicks "Conectar Google Calendar" in onboarding
2. Redirect to Google OAuth consent screen (scopes: `calendar.events`, `calendar.readonly`)
3. Exchange code for access_token + refresh_token
4. Store encrypted refresh_token in `calendar_configs` table
5. Use refresh_token to get new access_tokens as needed

### Calendar Operations
- `listEvents(calendarId, timeMin, timeMax)` — Get busy slots
- `insertEvent(calendarId, event)` — Book appointment
- `deleteEvent(calendarId, eventId)` — Cancel appointment
- `listCalendars()` — Let user pick which calendar to use

### Availability Calculation
```
available_slots = generate_all_slots(config) - busy_events(google_calendar) - booked_appointments(our_db)
```
Always double-check against both Google Calendar AND our appointments table to avoid double-booking.

## Database Schema (Core Tables)

```sql
-- accounts (tenants)
accounts: id, email, business_name, business_phone, business_type, plan, status, created_at, updated_at

-- whatsapp_connections
whatsapp_connections: id, account_id, phone_number_id, waba_id, access_token_encrypted, webhook_verify_token, status, created_at

-- bots
bots: id, account_id, name, flow_json, status (draft/published/paused), published_at, version, created_at, updated_at

-- bot_versions (for rollback)
bot_versions: id, bot_id, version, flow_json, published_at, created_at

-- calendar_configs
calendar_configs: id, account_id, google_refresh_token_encrypted, calendar_id, available_days (jsonb), available_hours (jsonb), professionals (jsonb), created_at, updated_at

-- conversations
conversations: id, account_id, bot_id, contact_phone, contact_name, current_node_id, variables (jsonb), status (active/completed/handed_off), started_at, last_message_at, created_at

-- messages
messages: id, conversation_id, direction (inbound/outbound), content, message_type, wa_message_id, created_at

-- appointments
appointments: id, account_id, conversation_id, patient_name, patient_phone, professional, appointment_type, start_time, end_time, google_event_id, status (confirmed/cancelled/completed), reminder_sent, created_at, updated_at
```

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=     # You define this, Meta verifies against it
WHATSAPP_APP_SECRET=               # For webhook signature verification

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Encryption
ENCRYPTION_KEY=                    # For encrypting tokens at rest (32-byte hex)

# App
NODE_ENV=development
APP_URL=http://localhost:3000
ENGINE_URL=http://localhost:4000
```

## Testing Strategy

- **Unit tests:** Vitest for flow-schema validation, node execution logic, availability calculation
- **Integration tests:** Test WhatsApp webhook handling with mocked Meta responses
- **E2E tests:** Playwright for the web editor (critical paths: create flow → test in simulator → publish)
- **Manual testing:** Use WhatsApp's test number for webhook development

## Common Tasks

### Start development
```bash
pnpm install
pnpm dev          # Starts both web (3000) and engine (4000)
```

### Database migrations
```bash
pnpm --filter db migrate        # Run pending migrations
pnpm --filter db generate       # Generate migration from schema changes
pnpm --filter db studio         # Open Drizzle Studio
```

### Run tests
```bash
pnpm test                       # All packages
pnpm --filter flow-schema test  # Specific package
```

### Deploy
```bash
pnpm build                      # Build all
# Web deploys via Vercel Git integration
# Engine deploys via Docker → Railway/Oracle Cloud
```

## Priorities and Constraints

1. **Ship fast** — Prefer simple solutions. Don't over-engineer. We can refactor later.
2. **Mobile-first** — Many clinic owners will access the editor from their phone. The editor MUST work on mobile.
3. **pt-BR everywhere** — All UI text, error messages, tooltips, email notifications in Portuguese.
4. **Cost-conscious** — Stay within free tiers (Supabase, Vercel) as long as possible. No unnecessary paid services.
5. **Security basics** — Encrypt tokens at rest, validate webhook signatures, use RLS, sanitize all user input. Don't skip these.

## Known Gotchas

- **WhatsApp interactive buttons max 3** — If you need more options, use a list (up to 10 items)
- **WhatsApp message template approval takes 24-48h** — Submit templates early
- **Google Calendar API has 1M queries/day free** — More than enough for MVP
- **Supabase free tier: 500MB database, 2GB storage** — Monitor usage
- **WhatsApp Cloud API webhook MUST be HTTPS** — Use ngrok for local development
- **Meta webhook retries** — If you return non-200, Meta retries up to 7 times. Always return 200 quickly, process async.
- **24-hour messaging window** — After 24h of no user message, you can only send pre-approved templates. This affects reminders.

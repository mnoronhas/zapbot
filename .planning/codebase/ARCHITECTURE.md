# Architecture

**Analysis Date:** 2026-02-17

## Pattern Overview

**Overall:** Event-driven multi-tenant monorepo with a stateless message-processing engine

**Key Characteristics:**
- Flow JSON is the system contract -- the visual editor produces it, the engine consumes it, and `@zapbot/flow-schema` is the single source of truth
- WhatsApp message processing is stateless: every webhook triggers a DB lookup, flow execution, and response cycle with no in-memory state
- Multi-tenant isolation via `account_id` on every table, enforced by Supabase Row-Level Security
- Monorepo with strict package boundaries: shared packages export types and clients, the engine app orchestrates them

## Layers

**Presentation Layer (apps/web -- planned):**
- Purpose: Visual flow editor, simulator, dashboard, and onboarding UI
- Location: `zapbot-project/zapbot/apps/web/` (not yet created; structure planned in `zapbot-project/zapbot/{apps/{web/`)
- Contains: Next.js 14 App Router pages, React components (editor, simulator, dashboard, onboarding), Zustand state, hooks, styles
- Depends on: `@zapbot/flow-schema` (for flow JSON types/validation), Supabase client (auth + DB), Engine API
- Used by: End users (clinic owners) via browser
- Prototype exists at: `ZapBot_Editor_Prototype.jsx` (standalone React component, ~700 lines, demonstrates the editor + phone simulator UI)

**Engine Layer (apps/engine):**
- Purpose: Bot runtime -- processes WhatsApp webhooks, executes flow logic, sends responses, manages conversations
- Location: `zapbot-project/zapbot/apps/engine/`
- Contains: Fastify HTTP server, flow engine service, webhook handlers
- Depends on: `@zapbot/flow-schema`, `@zapbot/whatsapp`, `@zapbot/calendar`, `@zapbot/db`
- Used by: Meta WhatsApp Cloud API (webhooks), web frontend (REST API)
- Entry point: `zapbot-project/zapbot/apps/engine/src/server.ts`

**Flow Schema Layer (packages/flow-schema):**
- Purpose: Single source of truth for the flow JSON document structure -- Zod schemas, TypeScript types, validation, analysis, and template factory
- Location: `zapbot-project/zapbot/packages/flow-schema/src/index.ts`
- Contains: Zod schemas (BotFlow, FlowNode, FlowOption, ListSection, AppointmentConfig, ConditionRule), validation helpers (`validateFlow`, `analyzeFlow`), template factory (`createClinicTemplate`)
- Depends on: `zod`
- Used by: `@zapbot/engine`, future `apps/web`

**WhatsApp Client Layer (packages/whatsapp):**
- Purpose: WhatsApp Cloud API client -- sending messages, parsing incoming webhooks, verifying signatures
- Location: `zapbot-project/zapbot/packages/whatsapp/src/index.ts`
- Contains: `WhatsAppClient` class, webhook parsing, message types, error handling
- Depends on: `zod`, Node.js `crypto`
- Used by: `@zapbot/engine`

**Calendar Integration Layer (packages/calendar):**
- Purpose: Google Calendar API integration -- OAuth flow, availability calculation, appointment CRUD
- Location: `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Contains: OAuth helpers (`getAuthUrl`, `exchangeCode`, `refreshAccessToken`), calendar operations (`listCalendars`, `getBusySlots`, `createEvent`, `deleteEvent`), availability calculator (`calculateAvailability`, `generatePossibleSlots`)
- Depends on: `googleapis`
- Used by: `@zapbot/engine`

**Database Layer (packages/db):**
- Purpose: Drizzle ORM schema definitions for PostgreSQL (Supabase)
- Location: `zapbot-project/zapbot/packages/db/src/`
- Contains: Table schemas, enum definitions, index definitions
- Depends on: `drizzle-orm`, `postgres`
- Used by: `@zapbot/engine`

## Package Dependency Graph

```
apps/engine
├── @zapbot/flow-schema  (flow types, validation)
├── @zapbot/whatsapp     (WhatsApp Cloud API client)
├── @zapbot/calendar     (Google Calendar client)
└── @zapbot/db           (Drizzle schema, DB access)

apps/web (planned)
├── @zapbot/flow-schema  (flow types for editor)
└── Supabase client      (auth, direct DB reads)

@zapbot/flow-schema      → zod
@zapbot/whatsapp         → zod, node:crypto
@zapbot/calendar         → googleapis
@zapbot/db               → drizzle-orm, postgres
```

Note: `@zapbot/flow-schema` is the only package shared between the frontend and backend. This is intentional -- the flow JSON schema is the contract that decouples the visual editor from the bot runtime.

## Data Flow

**WhatsApp Incoming Message Flow:**

1. User sends a WhatsApp message
2. Meta Cloud API forwards the message as a POST webhook to `POST /webhooks/whatsapp` on the engine (`zapbot-project/zapbot/apps/engine/src/server.ts`, line 42)
3. Engine immediately returns HTTP 200 to prevent Meta retries (line 45)
4. Engine parses the raw webhook payload using `WhatsAppClient.parseIncomingMessage()` (`zapbot-project/zapbot/packages/whatsapp/src/index.ts`, line 193) to extract a `ParsedMessage`
5. Engine looks up the active conversation in the DB by contact phone number (conversations table in `zapbot-project/zapbot/packages/db/src/schema/index.ts`, line 153)
6. Engine loads the bot's flow JSON from the bots table, constructs a `FlowEngine` instance (`zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`, line 49)
7. `FlowEngine.process()` takes the `ParsedMessage` and current `ConversationState`, executes the current node, resolves the next node, and returns `EngineOutput` containing outgoing messages and side effects
8. Engine sends outgoing messages via `WhatsAppClient` (sendText, sendButtons, sendList, or sendTemplate)
9. Engine persists updated conversation state and message records to the DB
10. Engine processes side effects (track analytics events, book appointments, trigger handoffs)

**Current status:** Steps 4-10 are partially wired. The webhook handler in `server.ts` has TODO comments at lines 49-52 for parsing, routing, and sending. The `FlowEngine` class is fully implemented. The `WhatsAppClient` is fully implemented. The wiring between them is not yet built.

**WhatsApp Webhook Verification Flow:**

1. Meta sends a GET request to `/webhooks/whatsapp` with `hub.mode`, `hub.verify_token`, and `hub.challenge` query parameters
2. Engine validates the verify token against `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var (`zapbot-project/zapbot/apps/engine/src/server.ts`, line 19)
3. If valid, returns the challenge string with HTTP 200

**Appointment Booking Flow:**

1. Flow engine reaches an `appointment` type node during conversation
2. Engine emits a `fetch_availability` side effect with the appointment config
3. `calculateAvailability()` in `@zapbot/calendar` (`zapbot-project/zapbot/packages/calendar/src/index.ts`, line 267):
   a. Generates all possible time slots from the professional's schedule config
   b. Fetches busy slots from Google Calendar via the FreeBusy API
   c. Filters out overlapping slots (including buffer time)
   d. Returns available `AvailabilitySlot[]`
4. Engine presents available slots to the user via WhatsApp list or buttons
5. User selects a slot
6. Engine calls `createEvent()` to book the appointment in Google Calendar
7. Engine inserts a record in the appointments table
8. Confirmation message sent to user with appointment details

**Google Calendar OAuth Flow:**

1. User clicks "Connect Google Calendar" in the web UI
2. Web app generates an OAuth URL via `getAuthUrl()` (`zapbot-project/zapbot/packages/calendar/src/index.ts`, line 69)
3. User authorizes on Google's consent screen
4. Google redirects back to `GOOGLE_REDIRECT_URI` with an authorization code
5. Backend calls `exchangeCode()` (line 82) to get access + refresh tokens
6. Refresh token is encrypted and stored in `calendar_configs` table (`zapbot-project/zapbot/packages/db/src/schema/index.ts`, line 126)
7. `refreshAccessToken()` (line 111) is called as needed to get fresh access tokens

**State Management:**

- **Conversation state:** Persisted in PostgreSQL `conversations` table -- `current_node_id`, `variables` (JSONB), `status`
- **No in-memory state:** Each webhook request is fully self-contained -- load state from DB, process, save back
- **Frontend state (planned):** Zustand stores for the flow editor, not yet implemented
- **Bot flow versions:** The `bots` table stores the current flow JSON; `bot_versions` table stores historical versions for rollback

## Flow Engine Execution Model

**Location:** `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`

**Core Class:** `FlowEngine`
- Constructor takes a `BotFlow` (the validated flow JSON) and builds a `Map<string, FlowNode>` for O(1) node lookup
- Single public method: `process(message: ParsedMessage, state: ConversationState): EngineOutput`

**Execution Algorithm:**

1. If `state.currentNodeId` is null, this is a new conversation -- start from `flow.startNodeId`
2. Otherwise, call `resolveNextNode()` on the current node to determine where to go based on the user's response:
   - `buttons`: Match button click (by `buttonId`) or text input (case-insensitive) to an option's `value` or `label`
   - `list`: Match by `listItemId` or text against item titles
   - `collect`: Store the user's text input in `state.variables[node.field]`
   - `appointment`: Process slot selection (TODO)
   - Default: Follow `node.next`
3. Call `executeNode()` on the resolved next node to produce outgoing messages:
   - `message`: Send text, auto-advance to `node.next` if present (recursive), otherwise mark conversation completed
   - `buttons`: Send interactive buttons (max 3), wait for user response
   - `list`: Send interactive list with sections, wait for user response
   - `collect`: Send prompt text, wait for user input
   - `appointment`: Send text, emit `fetch_availability` side effect, wait
   - `condition`: Evaluate condition against variables, recursively execute the matching branch (`thenNext` or `elseNext`)
   - `handoff`: Send message, mark conversation as `handed_off`, emit `handoff` side effect
   - `wait`: Skip delay (TODO: implement actual delay), auto-advance

**Variable Interpolation:** `{variableName}` placeholders in node content are replaced with values from `state.variables` via `interpolate()` (line 322)

**Side Effects:** The engine produces side effects as data (not executing them directly). The calling code is responsible for handling:
- `track_event` -- Analytics tracking (conversation_started, node_reached)
- `book_appointment` -- Create appointment record + calendar event
- `handoff` -- Transfer to human agent
- `fetch_availability` -- Query Google Calendar for available slots

**Condition Evaluation:** Supports operators: `equals`, `not_equals`, `contains`, `exists`, `not_exists` (line 298)

## Key Abstractions

**BotFlow (flow document):**
- Purpose: The complete bot conversation definition -- the contract between the visual editor and the runtime
- Defined in: `zapbot-project/zapbot/packages/flow-schema/src/index.ts` (line 119)
- Pattern: Zod schema with inferred TypeScript type
- Contains: `version`, `startNodeId`, `nodes: FlowNode[]`

**FlowNode (conversation block):**
- Purpose: A single step in the conversation flow
- Defined in: `zapbot-project/zapbot/packages/flow-schema/src/index.ts` (line 71)
- 8 node types: `message`, `buttons`, `list`, `collect`, `appointment`, `condition`, `handoff`, `wait`
- Discriminated by `type` field with type-specific required fields enforced by Zod refine

**ConversationState:**
- Purpose: Tracks where a user is in the flow and what data has been collected
- Defined in: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts` (line 17)
- Contains: `conversationId`, `currentNodeId`, `variables`, `status`

**EngineOutput:**
- Purpose: The result of processing a message -- what to send back and what side effects to trigger
- Defined in: `zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts` (line 24)
- Contains: `messages: OutgoingMessage[]`, `state: ConversationState`, `sideEffects: SideEffect[]`

**ParsedMessage:**
- Purpose: Normalized representation of an incoming WhatsApp message
- Defined in: `zapbot-project/zapbot/packages/whatsapp/src/index.ts` (line 277)
- Supports: `text`, `button_reply`, `list_reply` message types

**WhatsAppClient:**
- Purpose: HTTP client for the WhatsApp Cloud API (Messages API v21.0)
- Defined in: `zapbot-project/zapbot/packages/whatsapp/src/index.ts` (line 60)
- Pattern: Instance-based client with config (phoneNumberId, accessToken, appSecret)

## Entry Points

**Engine Server:**
- Location: `zapbot-project/zapbot/apps/engine/src/server.ts`
- Triggers: `pnpm --filter engine dev` (tsx watch) or `pnpm --filter engine start` (compiled)
- Responsibilities: Start Fastify server on port 4000, register CORS, define health check and webhook routes
- Planned API routes (commented out, lines 64-67): bots, conversations, appointments, analytics

**Web App (planned):**
- Location: `zapbot-project/zapbot/apps/web/` (not yet created)
- Triggers: `pnpm --filter web dev`
- Responsibilities: Next.js 14 App Router frontend with visual flow editor, phone simulator, dashboard, onboarding

## Error Handling

**Strategy:** Return user-friendly pt-BR error messages in the conversation; log detailed errors server-side via Fastify's built-in Pino logger

**Patterns:**
- Flow engine returns fallback messages ("Desculpe, ocorreu um erro. Tente novamente mais tarde.") when nodes are missing (`flow-engine.ts`, lines 77, 93, 107)
- Invalid button/list selections get a retry prompt ("Desculpe, nao entendi. Por favor, selecione uma das opcoes.") rather than an error (`flow-engine.ts`, lines 239, 254)
- WhatsApp webhook always returns HTTP 200 immediately, processes async, logs errors (`server.ts`, lines 45-56)
- `WhatsAppClient` throws `WhatsAppApiError` with statusCode and details on API failures (`whatsapp/src/index.ts`, line 291)
- Calendar operations throw generic `Error` with stringified API responses (`calendar/src/index.ts`, lines 100, 129, 159)

## Cross-Cutting Concerns

**Logging:** Fastify's built-in Pino logger (`app.log.info`, `app.log.error`). Calendar package uses `console.warn` for missing appSecret. No structured logging framework beyond Pino.

**Validation:** Zod schemas in `@zapbot/flow-schema` for flow document validation. `validateFlow()` for safe parsing. `analyzeFlow()` for structural analysis (unreachable nodes, dead ends, missing references, duplicates). Webhook request body validation is not yet implemented (TODO in `server.ts`).

**Authentication:** Supabase Auth planned (Google OAuth + email). WhatsApp webhook verification via HMAC-SHA256 signature check (`WhatsAppClient.verifyWebhookSignature()`) and challenge/response (`handleVerifyChallenge()`). Google Calendar OAuth for calendar access. Token encryption at rest planned (ENCRYPTION_KEY env var).

**Multi-tenancy:** Every DB table includes `account_id` column with foreign key to `accounts`. Supabase RLS policies enforce tenant isolation. Convention: never query without filtering by `account_id`.

**Timezone Handling:** All dates stored in UTC (`withTimezone: true` on all timestamp columns). Default timezone is `America/Sao_Paulo`, configurable per account in `calendar_configs.timezone`. Frontend responsible for UTC-to-local conversion.

---

*Architecture analysis: 2026-02-17*

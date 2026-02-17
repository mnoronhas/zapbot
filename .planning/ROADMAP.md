# ZapBot v1 MVP — Roadmap

## Milestone: v1-mvp
**Goal**: Working WhatsApp chatbot builder — editor, engine, scheduling — end-to-end.
**Approach**: Prototype speed. Ship phases fast, iterate.

---

## Phase 1: Foundation — Database, Auth & Project Scaffold
**Goal**: Bootable backend with auth, RLS, and the React app shell running locally.

**Requirements covered**: FR-01 (Account System), NFR-01.1-01.2 (Auth + RLS), NFR-05 (Deployment scaffold)

**Deliverables**:
- Set up frontend project (React + Vite or Next.js — minimal) with PT-BR shell
- Supabase Auth integration (registration, login, Google OAuth)
- Auth middleware for Fastify API routes (JWT verification)
- RLS policies on all tenant-scoped tables via Drizzle schema
- Token encryption utility (AES-256-GCM encrypt/decrypt for stored secrets)
- Environment configuration (dev/prod separation)
- Basic API route structure: `/api/v1/bots`, `/api/v1/account`

**Exit criteria**: A user can register, log in, and hit an authenticated API endpoint that returns their account data. RLS prevents cross-tenant access. Tokens encrypt/decrypt correctly.

---

## Phase 2: Flow Editor — Visual Bot Builder
**Goal**: The flow editor prototype is connected to a real app, saves to DB, and has full CRUD.

**Requirements covered**: FR-02 (Visual Flow Editor), FR-02.4 (Zod validation), FR-02.5 (Flow lifecycle)

**Deliverables**:
- Integrate `ZapBot_Editor_Prototype.jsx` into the React app
- Bot CRUD API (`POST/GET/PUT/DELETE /api/v1/bots`)
- Flow JSON saved to `bots.flow_json` column (Zod-validated on save)
- Flow lifecycle (draft/published/paused) with status toggle
- Bot list page (dashboard showing user's bots)
- Phone simulator preserved and working within the app

**Exit criteria**: User can create a bot, build a flow with all 6 block types, save it, reload the page and see it persisted, toggle publish/pause status.

---

## Phase 3: WhatsApp Connection & Webhook
**Goal**: A published bot can receive WhatsApp messages and the engine can send replies.

**Requirements covered**: FR-03 (WhatsApp Integration), NFR-01.3 (Webhook signature verification), NFR-04.1 (Idempotent webhooks)

**Deliverables**:
- WhatsApp connection setup UI (enter phone_number_id, access_token, app_secret)
- Store encrypted WhatsApp credentials in `whatsapp_connections` table
- Webhook endpoint (`POST /webhooks/whatsapp`) with HMAC-SHA256 signature verification
- Webhook verification endpoint (`GET /webhooks/whatsapp`) for Meta challenge
- Route incoming messages to the correct bot (by phone number → account → published bot)
- Idempotent message processing (track `message_id` to prevent duplicate handling)
- Send text and button messages via WhatsApp Cloud API

**Exit criteria**: Meta webhook verification passes. An incoming WhatsApp message is received, routed to the correct bot, and the engine can send a reply back.

---

## Phase 4: Flow Execution Engine
**Goal**: The engine executes a full conversation flow — from first message to completion — handling all block types.

**Requirements covered**: FR-04 (Flow Execution Engine), FR-07 (Human Handoff)

**Deliverables**:
- Conversation session management (create/resume/complete sessions in DB)
- Flow interpreter: walk the flow graph node by node based on user input
- Block executors for all 6 types:
  - **Message**: Send text with variable substitution
  - **Buttons**: Send interactive buttons, match user selection to advance
  - **Collect**: Store user input in session variables
  - **Condition**: Evaluate simple conditions to branch the flow
  - **Appointment**: (placeholder — triggers scheduling in Phase 5)
  - **Handoff**: Mark conversation for human follow-up, send notification
- Variable store per session (`{nome_paciente}`, `{data_consulta}`, etc.)
- Session timeout handling (reset after inactivity)

**Exit criteria**: A complete conversation flow runs end-to-end via WhatsApp — greeting → buttons → collect name → condition → handoff — with all variables substituted correctly.

---

## Phase 5: Google Calendar Scheduling
**Goal**: The appointment block works — checks availability, presents slots, creates events.

**Requirements covered**: FR-05 (Google Calendar Scheduling), NFR-04.2 (Token expiry handling)

**Deliverables**:
- Google Calendar OAuth setup UI (connect calendar, select which calendar)
- Schedule configuration (working days, hours, slot duration, buffer time)
- Real-time availability: FreeBusy API → generate available slots
- Present time slots to user via WhatsApp buttons
- Create Google Calendar event on confirmation
- Send appointment confirmation message with details
- Handle expired/revoked tokens gracefully (prompt re-authorization)
- Access token caching (in-memory TTL cache to avoid hitting Google on every request)

**Exit criteria**: A user chats with the bot on WhatsApp, sees available time slots from Google Calendar, picks one, and a real event appears on the professional's Google Calendar.

---

## Phase 6: Dashboard & Polish
**Goal**: Basic analytics and polish for a shippable MVP.

**Requirements covered**: FR-06 (Dashboard), NFR-02 (Performance), NFR-03 (Usability)

**Deliverables**:
- Dashboard page: conversation count, appointment count, completion rate
- Conversation log view (list of recent conversations with status)
- Error handling polish (user-friendly error messages in PT-BR)
- Loading states and empty states throughout the UI
- Mobile-responsive layout adjustments
- Basic onboarding flow (guide new user through: create bot → connect WhatsApp → publish)

**Exit criteria**: A new user can sign up, create a bot, connect WhatsApp, connect Google Calendar, publish, and see conversations + appointments in the dashboard. The full loop works.

---

## Requirement Coverage Matrix

| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-01 Account System | Phase 1 | Planned |
| FR-02 Flow Editor | Phase 2 | Planned |
| FR-03 WhatsApp Integration | Phase 3 | Planned |
| FR-04 Flow Engine | Phase 4 | Planned |
| FR-05 Calendar Scheduling | Phase 5 | Planned |
| FR-06 Dashboard | Phase 6 | Planned |
| FR-07 Human Handoff | Phase 4 | Planned |
| NFR-01 Security (Auth/RLS/Encryption) | Phase 1 + 3 | Planned |
| NFR-02 Performance | Phase 6 | Planned |
| NFR-03 Usability (PT-BR) | Phase 1 + 6 | Planned |
| NFR-04 Reliability | Phase 3 + 4 + 5 | Planned |
| NFR-05 Deployment | Phase 1 | Planned |

**Coverage**: All v1 requirements are mapped to at least one phase. No orphaned requirements.

---
*Generated: 2026-02-17*

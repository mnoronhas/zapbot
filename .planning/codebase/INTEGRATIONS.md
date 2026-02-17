# External Integrations

**Analysis Date:** 2026-02-17

## APIs & External Services

### WhatsApp Cloud API (Meta)

**Purpose:** Core messaging channel. All end-user interactions happen over WhatsApp.

**Client Implementation:** `zapbot-project/zapbot/packages/whatsapp/src/index.ts`
- Custom client class `WhatsAppClient` wrapping the Graph API via `fetch()`
- No third-party SDK; direct HTTP calls to `https://graph.facebook.com/{version}/{phoneNumberId}/messages`
- Default API version: `v21.0`

**Capabilities Implemented:**
- `sendText(to, body)` - Plain text messages
- `sendButtons(to, body, buttons)` - Interactive buttons (max 3, enforced)
- `sendList(to, body, buttonText, sections)` - Interactive list menus
- `sendTemplate(to, templateName, languageCode, components?)` - Pre-approved templates for 24h+ window messages
- `markAsRead(messageId)` - Mark incoming messages as read
- `verifyWebhookSignature(rawBody, signature)` - HMAC-SHA256 signature verification
- `handleVerifyChallenge(mode, token, challenge, expectedToken)` - Meta webhook GET verification
- `parseIncomingMessage(message)` - Extracts `ParsedMessage` from webhook payload (text, button_reply, list_reply)

**Webhook Endpoints** (in `zapbot-project/zapbot/apps/engine/src/server.ts`):
- `GET /webhooks/whatsapp` - Meta verification challenge (implemented)
- `POST /webhooks/whatsapp` - Incoming messages (stub: returns 200 immediately, processing TODOs remain)

**Auth:** Bearer token via `WHATSAPP_ACCESS_TOKEN` env var
**Signature Verification:** HMAC-SHA256 using `WHATSAPP_APP_SECRET` env var (implemented in client, not yet wired in server)

**Environment Variables:**
- `WHATSAPP_PHONE_NUMBER_ID` - Meta phone number ID
- `WHATSAPP_BUSINESS_ACCOUNT_ID` - WABA ID
- `WHATSAPP_ACCESS_TOKEN` - Long-lived access token
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Custom token for webhook verification handshake
- `WHATSAPP_APP_SECRET` - App secret for webhook signature verification

**Rate Limits (documented in CLAUDE.md):**
- 80 messages/second per phone number
- 1,000 unique recipients/24h on unverified numbers

**Message Templates Required (pre-approved in Meta Business Manager):**
- `appointment_reminder` - 24h before appointment
- `appointment_confirmation` - After booking

---

### Google Calendar API v3

**Purpose:** Appointment scheduling. Calculate availability, create/delete calendar events.

**Client Implementation:** `zapbot-project/zapbot/packages/calendar/src/index.ts`
- Custom functions wrapping `fetch()` calls to `https://www.googleapis.com/calendar/v3`
- Also depends on `googleapis` ^140.0.0 in package.json (but current implementation uses raw `fetch`, not the SDK)

**Capabilities Implemented:**
- **OAuth Flow:**
  - `getAuthUrl(config, state?)` - Generates Google OAuth consent URL
  - `exchangeCode(config, code)` - Exchanges authorization code for access + refresh tokens
  - `refreshAccessToken(config, refreshToken)` - Refreshes expired access tokens
- **Calendar Operations:**
  - `listCalendars(accessToken)` - Lists user's calendars
  - `getBusySlots(accessToken, calendarId, timeMin, timeMax, timezone)` - FreeBusy query
  - `createEvent(bookingRequest)` - Creates a calendar event (appointment booking)
  - `deleteEvent(accessToken, calendarId, eventId)` - Deletes a calendar event (cancellation)
- **Availability Calculation:**
  - `calculateAvailability(accessToken, request)` - Generates possible time slots based on professional's schedule, subtracts Google Calendar busy times
  - `generatePossibleSlots(professional, duration, buffer, from, to, timezone)` - Internal helper for slot generation

**OAuth Scopes:**
- `https://www.googleapis.com/auth/calendar.events` (read/write events)
- `https://www.googleapis.com/auth/calendar.readonly` (read calendar list)

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `GOOGLE_REDIRECT_URI` - OAuth redirect URI (default: `http://localhost:3000/api/auth/google/callback`)

**Setup Guide:** `zapbot-project/zapbot/docs/GOOGLE_CALENDAR_SETUP.md`

**Quotas:** 1,000,000 queries/day free tier (documented)

---

### Supabase

**Purpose:** Hosted PostgreSQL database + authentication provider.

**Current Integration Level:** Schema defined, client not yet wired up.

**Database:**
- PostgreSQL accessed via `postgres` (postgres.js) driver + Drizzle ORM
- Connection string expected via environment variable (not yet configured in code)
- Schema: `zapbot-project/zapbot/packages/db/src/schema/index.ts`
- Multi-tenant with `account_id` on every table (Row-Level Security planned but not implemented yet)

**Authentication (planned, not yet implemented):**
- Supabase Auth with Google OAuth + email
- `supabase_user_id` column on `accounts` table links Supabase auth user to tenant
- Google Calendar token storage tied to Supabase auth flow

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (for frontend)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for backend, bypasses RLS)

---

## Data Storage

**Database:**
- PostgreSQL via Supabase
  - Connection: Not yet configured in code (env var name TBD, likely `DATABASE_URL`)
  - ORM: Drizzle ORM ^0.33.0
  - Driver: postgres.js ^3.4.0
  - Migration tool: drizzle-kit ^0.24.0 (but `drizzle.config.ts` not yet created)

**Sensitive Data Storage:**
- WhatsApp access tokens stored encrypted: `whatsapp_connections.access_token_encrypted`
- Google refresh tokens stored encrypted: `calendar_configs.google_refresh_token_encrypted`
- Encryption key: `ENCRYPTION_KEY` env var (32-byte hex, encryption implementation not yet built)

**File Storage:** Not applicable (no file uploads in MVP)

**Caching:** None implemented

## Authentication & Identity

**End-User Auth (clinic owners accessing the web editor):**
- Provider: Supabase Auth (planned)
- Methods: Google OAuth + email/password
- Implementation: Not yet built (`apps/web` not scaffolded)

**WhatsApp Webhook Auth:**
- Webhook verification: Challenge-response handshake (implemented in `zapbot-project/zapbot/apps/engine/src/server.ts`)
- Webhook signature: HMAC-SHA256 verification (implemented in `WhatsAppClient` class, not yet wired into server)

**Google Calendar Auth:**
- OAuth 2.0 authorization code flow
- Refresh token stored encrypted in `calendar_configs` table
- Token refresh logic implemented in `zapbot-project/zapbot/packages/calendar/src/index.ts`

**Inter-Service Auth:**
- Engine API: No authentication implemented yet (TODO for API routes)

## Monitoring & Observability

**Error Tracking:** None configured

**Logs:**
- Fastify built-in logger (`Fastify({ logger: true })`) in `zapbot-project/zapbot/apps/engine/src/server.ts`
- Uses `app.log.info()`, `app.log.error()` for structured logging
- No external log aggregation

**Analytics:**
- Custom `analytics_events` table in database (`zapbot-project/zapbot/packages/db/src/schema/index.ts`)
- Event types: `conversation_started`, `node_reached`, `drop_off`, `appointment_booked`
- Side effects emitted by flow engine (`zapbot-project/zapbot/apps/engine/src/services/flow-engine.ts`) but not yet persisted

## CI/CD & Deployment

**Hosting (planned):**
- Frontend (`apps/web`): Vercel via Git integration
- Engine (`apps/engine`): Docker on Railway or Oracle Cloud
- Database: Supabase (hosted PostgreSQL)

**CI Pipeline:** None configured

**Deployment Configs:** `infra/` directory planned but does not exist yet

**Local Development:**
```bash
pnpm install           # Install all dependencies
pnpm dev               # Start all apps via Turborepo (engine on port 4000)
ngrok http 4000        # Expose engine for WhatsApp webhooks
```

## Environment Configuration

**Required env vars (from CLAUDE.md and .env.example):**

| Variable | Service | Used By |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Frontend (planned) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Frontend (planned) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Engine backend |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp | Engine |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WhatsApp | Engine |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp | Engine |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta WhatsApp | Engine |
| `WHATSAPP_APP_SECRET` | Meta WhatsApp | Engine |
| `GOOGLE_CLIENT_ID` | Google Calendar | Engine/Frontend |
| `GOOGLE_CLIENT_SECRET` | Google Calendar | Engine |
| `GOOGLE_REDIRECT_URI` | Google Calendar | Engine |
| `ENCRYPTION_KEY` | Internal | Engine (token encryption) |
| `NODE_ENV` | Internal | All |
| `APP_URL` | Internal | Engine CORS config |
| `ENGINE_URL` | Internal | Frontend (planned) |
| `ENGINE_PORT` | Internal | Engine (default: 4000) |

**Env file locations:**
- `.env.example` exists at `zapbot-project/zapbot/.env.example` (template)
- Turbo watches `**/.env.*local` as global dependencies

## Webhooks & Callbacks

**Incoming:**
- `GET /webhooks/whatsapp` - Meta webhook verification challenge (implemented)
- `POST /webhooks/whatsapp` - Incoming WhatsApp messages (stub, returns 200 immediately)

**Outgoing:**
- None (all outbound communication is via direct API calls to WhatsApp and Google Calendar)

**Callback URLs:**
- `{APP_URL}/api/auth/google/callback` - Google Calendar OAuth redirect (planned, frontend route)

## Integration Status Summary

| Integration | Client Built | Server Wired | Tests | Status |
|-------------|-------------|-------------|-------|--------|
| WhatsApp Cloud API | Yes (full) | Partial (webhook stub) | No | In Progress |
| Google Calendar API | Yes (full) | Not wired | No | Client Ready |
| Supabase DB | Schema defined | Not connected | No | Schema Only |
| Supabase Auth | Not started | Not started | No | Planned |
| Token Encryption | Not started | Not started | No | Planned |

---

*Integration audit: 2026-02-17*

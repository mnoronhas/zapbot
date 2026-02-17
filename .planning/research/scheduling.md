# Scheduling Domain Research: Appointment Scheduling & Google Calendar Integration

**Project:** ZapBot
**Domain:** WhatsApp chatbot appointment scheduling for Brazilian SMBs
**Researched:** 2026-02-17
**Overall Confidence:** MEDIUM-HIGH

---

## Table of Contents

1. [Google Calendar API Best Practices](#1-google-calendar-api-best-practices)
2. [Common Appointment Scheduling Patterns](#2-common-appointment-scheduling-patterns)
3. [Reminder and Confirmation Flows](#3-reminder-and-confirmation-flows)
4. [Cancellation and Rescheduling UX Patterns](#4-cancellation-and-rescheduling-ux-patterns)
5. [Multi-Provider Scheduling](#5-multi-provider-scheduling)
6. [Calendar Integration Alternatives](#6-calendar-integration-alternatives)
7. [Brazilian Market Specifics](#7-brazilian-market-specifics)
8. [Recommendations for ZapBot Roadmap](#8-recommendations-for-zapbot-roadmap)

---

## 1. Google Calendar API Best Practices

### 1.1 OAuth Flow

**Confidence: HIGH** (verified against official Google documentation)

The existing `@zapbot/calendar` package implements the OAuth 2.0 authorization code flow correctly. Key observations and recommendations:

**What is already correct in the codebase:**
- `prompt: "consent"` forces the consent screen every time, ensuring a refresh token is always returned. This is the right approach for a multi-tenant SaaS where each customer connects once.
- `access_type: "offline"` is correctly set to obtain refresh tokens.
- Scopes (`calendar.events` + `calendar.readonly`) are appropriate. However, Google now offers a narrower `calendar.events.freebusy` scope that could be used for availability-only queries, reducing the permission surface shown to users during consent.

**Recommendations:**
- **Consider incremental authorization.** Google recommends requesting scopes only when needed. For ZapBot, you could request `calendar.readonly` first (to list calendars and check availability) and then upgrade to `calendar.events` when the user actually needs to create bookings. This makes the consent screen less intimidating. However, the added complexity may not be worth it for MVP -- the current approach is fine.
- **Add `state` parameter for CSRF protection.** The `getAuthUrl` function accepts an optional `state` parameter, but it should always be used. Generate a random value, store it in the session, and verify it on callback to prevent CSRF attacks.
- **Handle the `hd` parameter.** For Google Workspace users (clinics using Google Workspace), consider passing `hd` (hosted domain) to pre-select the correct account during consent.

### 1.2 Token Management

**Confidence: HIGH** (verified against official Google documentation)

**Refresh Token Lifecycle -- Critical knowledge:**

| Event | What Happens | Action Required |
|-------|-------------|-----------------|
| User revokes access | Refresh token stops working | Detect 400/401 on refresh, prompt re-authorization |
| Token unused for 6 months | Refresh token expires | Not an issue if scheduling is active; add monitoring for dormant accounts |
| User changes Google password | Token may be invalidated (if Gmail scopes) | Calendar-only scopes are NOT affected by password changes |
| 50 refresh tokens per user per client | Oldest token is silently invalidated | Unlikely for ZapBot (one token per account) |
| Google Cloud project in "Testing" mode | Refresh tokens expire after 7 days | Must publish app or add users as test users during dev |

**Existing gap in the codebase:** The `refreshAccessToken` function throws a generic error on failure. It needs to distinguish between:
1. **Temporary errors** (network issues, 5xx) -- retry with exponential backoff
2. **Invalid grant errors** (revoked, expired) -- mark the calendar connection as disconnected and notify the business owner to re-authorize
3. **Rate limit errors** (429) -- retry after the indicated delay

**Token storage recommendations:**
- The schema has `google_refresh_token_encrypted` and `google_access_token` columns. This is correct.
- **Cache access tokens in memory** (they last ~1 hour). Don't hit the database or Google's token endpoint on every scheduling request. Use a simple TTL cache keyed by `account_id`.
- **Proactive refresh:** Refresh the access token when it has less than 5 minutes remaining, not when it has already expired. This avoids failed requests.
- **Token encryption** is planned but not implemented. This is a security requirement, not optional. Use AES-256-GCM with the `ENCRYPTION_KEY` environment variable. The implementation should be straightforward: `encrypt(plaintext, key) -> iv + ciphertext + authTag` and `decrypt(encrypted, key) -> plaintext`.

### 1.3 Rate Limits and Quotas

**Confidence: MEDIUM** (Google does not publish exact per-minute limits publicly; they vary by project)

| Quota | Limit | Notes |
|-------|-------|-------|
| Daily queries | 1,000,000/day | More than enough for any scale ZapBot will reach |
| Per-minute per-project | Not published | Visible in Google Cloud Console for your project |
| Per-minute per-user | Not published | Visible in Google Cloud Console for your project |
| FreeBusy query calendar limit | 50 calendars per request | Sufficient for multi-provider scheduling |
| FreeBusy group limit | 100 identifiers per group | Sufficient |

**Rate limit handling pattern:**
```
On 403 (usageLimits) or 429 (rateLimitExceeded):
  1. Read Retry-After header if present
  2. Apply exponential backoff: wait(min(2^attempt * 1000ms, 32000ms))
  3. Retry up to 5 times
  4. If still failing, queue the request and process later
```

**Practical guidance for ZapBot:** At MVP scale (tens of businesses, each with a few daily appointments), you will never hit rate limits. The daily 1M quota is roughly 700 requests per minute sustained for 24 hours. Even with aggressive availability checking, a single business would generate maybe 10-20 API calls per booking. Focus rate limit handling on correctness, not performance optimization.

### 1.4 Push Notifications (Watch API)

**Confidence: HIGH** (verified against official Google docs)

Google Calendar supports push notifications via watch channels. This is relevant for ZapBot because external changes to a provider's calendar (e.g., a doctor manually blocks time in Google Calendar) should reflect in ZapBot's availability.

**How it works:**
1. Call `events.watch()` for each connected calendar, providing a webhook URL.
2. Google sends a POST to your webhook when any event in that calendar changes.
3. The notification contains NO event data -- just a signal that something changed.
4. Your server must call the Events API with a sync token to get the actual changes (incremental sync).
5. Watch channels expire after ~7 days and must be renewed.

**Recommendation for ZapBot:** Do NOT implement push notifications for MVP. Instead, use a simpler approach:
- Query availability in real-time via `freeBusy.query()` every time a patient requests slots.
- This ensures fresh data with zero infrastructure complexity.
- Push notifications become valuable at scale (hundreds of businesses) to reduce API calls.
- If needed later, implement a cron job that renews watch channels every 5 days and processes incoming notifications to update a local availability cache.

### 1.5 Sync Token Pattern

**Confidence: HIGH** (verified against official Google docs)

For efficient synchronization:
1. **Full sync:** First call to `events.list()` returns all events + a `nextSyncToken`.
2. **Incremental sync:** Subsequent calls with `syncToken` return only changed events.
3. **Token invalidation:** If the server returns HTTP 410, discard the token and do a full sync.
4. **Sync tokens expire** after about 1 hour if unused.

**Relevance to ZapBot:** This pattern is useful for building a local cache of calendar events. For MVP, direct `freeBusy.query()` calls are simpler. Consider sync tokens when implementing features like "show the business owner their upcoming appointments from all sources."

---

## 2. Common Appointment Scheduling Patterns

### 2.1 Slot Generation

**Confidence: HIGH** (based on industry patterns and analysis of existing code)

The existing `generatePossibleSlots()` function in `@zapbot/calendar` implements the basic pattern correctly. However, there are several improvements to consider:

**Current implementation gaps:**

1. **Timezone handling is broken.** The function uses `new Date()` and `setHours()` which operate in the server's local timezone, not the business's timezone. This WILL cause incorrect slot generation if the server runs in UTC (which it will on Railway/Oracle Cloud). Fix: Use a timezone-aware library like `date-fns-tz` or `luxon` to generate slots in the business's timezone.

2. **No lunch break support.** Many Brazilian businesses close for lunch (typically 12:00-14:00). The `ProfessionalConfig` type only supports a single `availableHours` block. Recommendation: Change to `availableBlocks: Array<{ start: string; end: string }>` to support split schedules like `[{ "08:00", "12:00" }, { "14:00", "18:00" }]`.

3. **No per-day-of-week schedule variation.** A dentist might work 08:00-18:00 on weekdays but 08:00-12:00 on Saturdays. The current structure uses `availableDays` + one `availableHours` block. Recommendation: Use a `weeklySchedule` map: `{ 1: [{ start: "08:00", end: "18:00" }], 6: [{ start: "08:00", end: "12:00" }] }`.

4. **No holiday/blocked-date support.** Businesses need to block specific dates (holidays, vacations). Add a `blockedDates: string[]` field to `calendar_configs`.

5. **Slot alignment.** Slots should start on clean time boundaries (e.g., every 15 or 30 minutes) regardless of duration. A 45-minute appointment should start at 08:00, 08:30, 09:00 -- not 08:00, 08:45, 09:30. This makes schedules more readable and manageable.

**Recommended slot generation algorithm:**
```
Input: weeklySchedule, duration, buffer, dateRange, timezone, blockedDates
Output: AvailabilitySlot[]

For each day in dateRange:
  If day is in blockedDates, skip
  If day's weekday has no schedule, skip
  For each time block in weeklySchedule[weekday]:
    Generate slots starting at block.start, every slotInterval minutes
    Each slot: { start, end: start + duration }
    Skip slots where end > block.end
    Skip slots where start < now + minAdvanceMinutes

Then filter against:
  1. Google Calendar busy times (freeBusy.query)
  2. Existing ZapBot appointments in DB (for race condition safety)
  3. Buffer time conflicts
```

### 2.2 Buffer Time

**Confidence: HIGH**

Buffer time is the gap between appointments that allows for cleanup, preparation, or transition time. The current implementation adds buffer AFTER each slot when checking for overlaps, which is correct.

**Patterns observed in the industry:**
- **Post-buffer only** (current ZapBot approach): Buffer after each appointment. Simplest. Recommended for MVP.
- **Pre-buffer and post-buffer:** Different buffer before vs after appointments. Useful for services requiring setup (e.g., sterilization in dental offices).
- **Buffer between different appointment types:** Longer buffer between a consultation and a procedure.
- **No buffer between back-to-back same-type appointments:** Some providers want zero gap for efficiency.

**Recommendation for ZapBot:** Keep the current single `bufferMinutes` approach for MVP. Add `preBufferMinutes` and `postBufferMinutes` as a future enhancement for dental/medical clinics that need setup/cleanup time.

### 2.3 Double-Booking Prevention

**Confidence: HIGH** (PostgreSQL patterns are well-documented)

The CLAUDE.md specifies optimistic locking: show available slots, and if two patients book simultaneously, the second gets an apology. This is the correct approach for ZapBot's scale.

**Implementation pattern using PostgreSQL:**

```sql
-- Option 1: Transaction with existence check (simplest, recommended for ZapBot)
BEGIN;
  -- Check for conflicting appointments
  SELECT id FROM appointments
  WHERE professional = $1
    AND status = 'confirmed'
    AND start_time < $endTime
    AND end_time > $startTime
  FOR UPDATE;  -- Lock matching rows to prevent concurrent inserts

  -- If no conflicts, insert
  INSERT INTO appointments (...) VALUES (...);
COMMIT;

-- Option 2: Exclusion constraint (database-enforced, strongest guarantee)
-- Requires btree_gist extension
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    professional WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status = 'confirmed');
```

**Recommendation:** Use Option 1 (transaction + `SELECT FOR UPDATE`) for MVP. It is simple, effective at ZapBot's concurrency level, and does not require PostgreSQL extensions. The chance of two patients booking the exact same slot at the exact same millisecond is very low for a small business. The `SELECT FOR UPDATE` handles it if it does happen.

**Also verify against Google Calendar:** After inserting the appointment in the database, create the Google Calendar event. If the Calendar API returns an error (e.g., someone booked directly in Google Calendar), roll back the database insert and inform the patient.

### 2.4 Minimum Advance Time

**Confidence: HIGH**

Patients should not be able to book appointments that start in 5 minutes. Common patterns:
- **Minimum advance time:** 2-24 hours depending on service type. Default: 2 hours for ZapBot.
- **Maximum advance time:** Already in the schema as `maxAdvanceDays` (default 60). This prevents booking too far in the future.
- **Same-day cutoff:** Some businesses disable same-day booking entirely. Add as a boolean option.

**Recommendation:** Add `minAdvanceMinutes` to `calendar_configs` with a default of 120 (2 hours). Filter out slots that start before `now + minAdvanceMinutes` during slot generation.

---

## 3. Reminder and Confirmation Flows

### 3.1 Message Timing Strategy

**Confidence: HIGH** (verified across multiple sources)

WhatsApp reminders can reduce no-show rates by 30-70%. The optimal strategy is a tiered approach:

| Timing | Message Type | WhatsApp API | Purpose |
|--------|-------------|-------------|---------|
| Immediately after booking | Confirmation | Session message (free) | Confirm details, set expectations |
| 24 hours before | Reminder | Template message (may cost) | Reduce no-shows, offer reschedule |
| 2 hours before | Final reminder | Template message (may cost) | Last chance to cancel/reschedule |

**Critical constraint -- WhatsApp 24-hour window:**
- Messages sent within 24 hours of the patient's last message are "session messages" (free, any format).
- Messages sent outside the 24-hour window require pre-approved **template messages** (cost per message).
- Appointment reminders almost always fall outside the 24-hour window and therefore must use templates.

### 3.2 Template Messages Required

**Confidence: HIGH**

ZapBot needs these WhatsApp message templates registered in Meta Business Manager:

**1. `appointment_confirmation` (utility template)**
```
Sua consulta foi agendada!

Profissional: {{1}}
Data: {{2}}
Horario: {{3}}

Para cancelar ou reagendar, envie uma mensagem a qualquer momento.
```

**2. `appointment_reminder_24h` (utility template)**
```
Lembrete: Voce tem uma consulta amanha.

Profissional: {{1}}
Data: {{2}}
Horario: {{3}}

Confirmar: Responda SIM
Cancelar: Responda CANCELAR
Reagendar: Responda REAGENDAR
```

**3. `appointment_reminder_2h` (utility template)**
```
Sua consulta e em 2 horas.

Profissional: {{1}}
Horario: {{2}}
Endereco: {{3}}

Precisa de ajuda? Responda esta mensagem.
```

**4. `appointment_cancelled` (utility template)**
```
Sua consulta foi cancelada.

Data original: {{1}}
Horario original: {{2}}

Para agendar uma nova consulta, envie "agendar".
```

**Template approval takes 24-48 hours.** Submit templates early in development.

### 3.3 Reminder Infrastructure

**Confidence: MEDIUM** (implementation pattern is standard, but specific to ZapBot architecture)

ZapBot needs a background job system to send reminders at the right time. Options:

| Approach | Complexity | Reliability | Recommendation |
|----------|-----------|-------------|----------------|
| Cron job polling DB every minute | Low | Medium | **Use for MVP** |
| Job queue (BullMQ + Redis) | Medium | High | Use when scale demands it |
| Scheduled cloud functions (Supabase Edge Functions) | Medium | High | Good alternative if avoiding Redis |
| pg_cron (PostgreSQL extension) | Low | Medium | Supabase supports this natively |

**Recommended MVP approach -- Cron-based polling:**
```
Every 1 minute:
  Query: SELECT * FROM appointments
    WHERE status = 'confirmed'
    AND reminder_sent = false
    AND start_time BETWEEN now() AND now() + interval '24 hours 5 minutes'

  For each appointment:
    If start_time is 24h away (+/- 5min): Send 24h reminder template
    If start_time is 2h away (+/- 5min): Send 2h reminder template
    Update reminder_sent = true (or use a more granular tracking: reminder_24h_sent, reminder_2h_sent)
```

**Schema enhancement needed:** Replace the single `reminder_sent` boolean with:
```
reminder_24h_sent_at: timestamp (nullable)
reminder_2h_sent_at: timestamp (nullable)
confirmation_sent_at: timestamp (nullable)
```

**Alternative using Supabase pg_cron:** Supabase supports `pg_cron` out of the box. You could create a database function that identifies due reminders and inserts them into a `pending_notifications` queue table, which the engine polls.

### 3.4 Pricing Implications

**Confidence: HIGH** (verified with 2025-2026 pricing changes)

As of July 2025, WhatsApp pricing shifted to per-message for template messages:

| Category | Brazil Rate (per message) | Notes |
|----------|--------------------------|-------|
| Marketing | ~$0.0625 | Not relevant for reminders |
| Utility | ~$0.004 - $0.02 | Used for reminders/confirmations |
| Utility (within 24h window) | **Free** | Confirmation right after booking is free |
| Authentication | ~$0.004 - $0.02 | Not relevant |

**Cost impact for a typical clinic:**
- 20 appointments/day = ~20 confirmations (mostly free if within session) + 20 reminders at 24h + 20 reminders at 2h = ~40 paid utility messages/day
- At ~$0.01/message = ~$0.40/day = ~$12/month per clinic
- This is a small enough cost that it can be absorbed into the subscription or passed through transparently.

**Volume discounts** kick in automatically as monthly volume increases.

---

## 4. Cancellation and Rescheduling UX Patterns

### 4.1 Conversational Cancellation Flow

**Confidence: HIGH**

The cancellation flow via WhatsApp should be conversational and friction-free:

```
Patient: "cancelar"  (or "cancela", "quero cancelar", "nao vou")

Bot: "Encontrei sua consulta:
      Dr. Silva - 20/02 as 14:00

      Deseja cancelar esta consulta?
      [Sim, cancelar]  [Nao, manter]"

Patient: [Sim, cancelar]

Bot: "Consulta cancelada com sucesso.
      Deseja agendar uma nova consulta?
      [Sim]  [Nao, obrigado]"
```

**Key UX principles:**
1. **Detect intent flexibly.** "Cancelar", "cancela", "quero cancelar", "nao vou poder ir" should all trigger cancellation.
2. **Always confirm before canceling.** Show the appointment details and ask for explicit confirmation.
3. **Offer rescheduling immediately after cancellation.** This recovers revenue that would otherwise be lost.
4. **Handle multiple upcoming appointments.** If the patient has more than one, present a list to choose from.
5. **Enforce cancellation policies.** Configurable per business: allow cancellation up to X hours before the appointment. After that, inform the patient to call directly.

### 4.2 Rescheduling Flow

**Confidence: HIGH**

```
Patient: "reagendar" (or "mudar horario", "trocar consulta")

Bot: "Sua consulta atual:
      Dr. Silva - 20/02 as 14:00

      Vou mostrar os horarios disponiveis. Um momento..."

[Show available slots, same as initial booking flow]

Patient: [Selects new slot]

Bot: "Consulta reagendada!
      Novo horario: Dr. Silva - 22/02 as 10:00

      Horario anterior cancelado automaticamente."
```

**Implementation considerations:**
- Rescheduling = cancel old + book new, but atomic (both succeed or neither does).
- Delete the old Google Calendar event, create a new one.
- Update the `appointments` table: mark old as `cancelled`, insert new as `confirmed`.
- The `conversation_id` of the reschedule should link to the same conversation for analytics continuity.

### 4.3 Cancellation Policy Configuration

**Confidence: MEDIUM** (based on industry patterns)

Add to `calendar_configs`:
```
min_cancellation_hours: integer (default: 2)
allow_patient_reschedule: boolean (default: true)
max_reschedules_per_appointment: integer (default: 2)
```

### 4.4 No-Show Handling

**Confidence: MEDIUM**

After the appointment time passes, the status should be updated. Options:
- **Manual:** Business owner marks no-shows in the dashboard.
- **Automatic:** If the patient doesn't respond to a "How was your visit?" follow-up message within X hours, mark as no-show.
- **Hybrid (recommended):** Default to `completed` after 2 hours, let business override to `no_show`.

---

## 5. Multi-Provider Scheduling

### 5.1 Architecture for Multiple Professionals

**Confidence: HIGH** (based on codebase analysis + industry patterns)

The current schema stores `professionals` as JSONB in `calendar_configs`. This is adequate for MVP but has limitations.

**Current data model:**
```typescript
type ProfessionalConfig = {
  name: string;
  calendarId: string;
  availableDays: number[];
  availableHours: { start: string; end: string };
};
```

**Recommended enhanced model:**
```typescript
type ProfessionalConfig = {
  id: string;                    // Unique identifier
  name: string;
  calendarId: string;            // Their Google Calendar ID
  services: string[];            // What services they provide
  weeklySchedule: Record<number, Array<{ start: string; end: string }>>;
  defaultDuration: number;       // Default appointment duration in minutes
  bufferMinutes: number;         // Per-professional buffer
  color?: string;                // For the dashboard UI
  active: boolean;               // Enable/disable without deleting
};
```

### 5.2 Selection Strategies

**Confidence: HIGH**

Three strategies for assigning a patient to a professional:

| Strategy | When to Use | Complexity |
|----------|------------|------------|
| **Patient chooses** | Patient has preference (e.g., "my dentist") | Low -- show list, filter availability |
| **Auto-assign (first available)** | Patient wants earliest slot regardless | Medium -- query all calendars, merge |
| **Round-robin** | Distribute workload evenly | Medium -- track assignment counts |

**Recommendation for ZapBot MVP:** Support "patient chooses" and "first available" (configured per bot in `AppointmentConfig.professionalSelection`). The current schema already has `professionalSelection: "manual" | "auto"` -- this maps directly.

### 5.3 Multi-Calendar FreeBusy

**Confidence: HIGH** (verified against FreeBusy API docs)

The FreeBusy API supports querying up to 50 calendars in a single request. For multi-provider scheduling:

```typescript
// Query all professionals' calendars in one API call
const freeBusyRequest = {
  timeMin: fromDate.toISOString(),
  timeMax: toDate.toISOString(),
  timeZone: timezone,
  items: professionals.map(p => ({ id: p.calendarId })),
};

const response = await calendarFetch("/freeBusy", accessToken, {
  method: "POST",
  body: JSON.stringify(freeBusyRequest),
});

// Response contains busy times keyed by calendarId
// Filter each professional's slots individually
```

**Important consideration:** All professionals' calendars must be accessible with the same OAuth token. This works when:
- All professionals use calendars within the same Google Workspace domain
- The business owner shares access to each professional's calendar

For professionals with separate Google accounts, each needs their own OAuth connection. This adds significant complexity. **Recommendation for MVP:** Assume one Google account per business, with separate calendars for each professional (which is the common Google Calendar pattern).

### 5.4 Shared vs. Individual Calendars

**Confidence: MEDIUM**

Two approaches for multi-provider:

| Approach | Pros | Cons |
|----------|------|------|
| **One calendar per professional** | Clean separation, each sees only their events | Need access to all calendars via one OAuth token |
| **One shared calendar, prefixed events** | Simple OAuth (one calendar), easy setup | Messy, no per-professional visibility in Google Calendar |

**Recommendation:** One calendar per professional. Guide users during onboarding to create sub-calendars in Google Calendar (which is free and easy) and share them with the ZapBot-connected account.

---

## 6. Calendar Integration Alternatives

### 6.1 Comparison Matrix

**Confidence: MEDIUM-HIGH**

| Provider | API | Auth | Complexity | Free Tier | Market Share (Brazil) |
|----------|-----|------|------------|-----------|----------------------|
| **Google Calendar** | REST v3 | OAuth 2.0 | Medium | 1M queries/day | **Dominant** (Android + Gmail) |
| **Microsoft Outlook** | Graph API | OAuth 2.0 (Azure AD) | High | 10K requests/app/10min | Moderate (enterprise) |
| **Apple iCloud** | CalDAV | App-specific passwords | Very High | No official API | Low (requires macOS) |
| **CalDAV (generic)** | CalDAV protocol | Various | High | N/A | Very low |
| **Cronofy** | REST | OAuth 2.0 | Low (abstraction) | 5 calendar accounts | N/A (aggregator) |
| **Nylas** | REST | OAuth 2.0 | Low (abstraction) | Limited free tier | N/A (aggregator) |
| **Cal.com** | REST | API key | Low | Open-source | N/A (scheduling platform) |

### 6.2 Microsoft Outlook / Graph API

**Confidence: MEDIUM** (based on documentation review, not implementation experience)

Adding Outlook support would capture enterprise/corporate clients in Brazil. Key differences from Google Calendar:

- **Auth:** Azure AD OAuth 2.0, more complex setup (requires Azure Portal app registration)
- **Calendar API:** `GET /me/calendarView` for events, `POST /me/calendar/events` for creation
- **FreeBusy equivalent:** `POST /me/calendar/getSchedule` -- similar concept, different API shape
- **Webhooks:** Graph API subscriptions, max 3 days expiry (vs. 7 days for Google)
- **Token refresh:** Similar OAuth 2.0 flow, but tokens managed through Azure AD

**Effort estimate:** 2-3 weeks of development to add Outlook support, assuming the calendar package is refactored into a provider-agnostic interface.

**Recommendation:** Not for MVP. Google Calendar covers 80%+ of Brazilian SMB users (Android dominance + Gmail adoption). Add Outlook when enterprise clients request it.

### 6.3 Calendar Abstraction Services

**Confidence: MEDIUM** (based on web research)

**Cronofy:** Best dedicated calendar API. Supports Google, Outlook, iCloud, Exchange, and generic CalDAV. Pricing starts at ~$49/mo for 100 calendar accounts. Uptime SLA 99.99% (excluding third-party issues). Availability queries work across providers in a single API call.

**Nylas:** More comprehensive (email + calendar + contacts) but more expensive. Pricing is per-connected-account. v3 API has domain restrictions on availability queries that would be problematic for ZapBot. Better for enterprises needing email integration.

**Recommendation for ZapBot:** Do NOT use an abstraction service for MVP. The added cost ($49+/mo) and dependency are not justified when Google Calendar alone covers the target market. Instead, design the `@zapbot/calendar` package with a provider interface pattern:

```typescript
interface CalendarProvider {
  getAuthUrl(state?: string): string;
  exchangeCode(code: string): Promise<TokenPair>;
  refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>;
  getAvailability(calendarId: string, from: Date, to: Date, timezone: string): Promise<BusySlot[]>;
  createEvent(event: CalendarEvent): Promise<BookingResult>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
```

Implement `GoogleCalendarProvider` first. Add `OutlookCalendarProvider` later with the same interface. This gives you the benefits of abstraction without the cost.

### 6.4 Future-Proofing Recommendation

**Confidence: HIGH**

Priority order for adding calendar providers:
1. **Google Calendar** (MVP) -- dominant in Brazil, especially SMBs
2. **Microsoft Outlook/Graph API** (v2) -- captures enterprise segment
3. **CalDAV** (v3, maybe never) -- niche, complex, low demand in target market
4. **Apple iCloud** (probably never) -- no official API, workarounds are fragile

---

## 7. Brazilian Market Specifics

### 7.1 Target Verticals and Appointment Types

**Confidence: MEDIUM** (based on market research + domain knowledge)

| Vertical | Common Appointment Types | Duration | Notes |
|----------|------------------------|----------|-------|
| **Dental clinics** | Avaliacao (eval), Limpeza (cleaning), Restauracao (filling), Emergencia | 30-90 min | Largest segment, 298K+ dentists in Brazil |
| **Medical clinics** | Consulta (consult), Retorno (follow-up), Exame (exam) | 15-60 min | Often use "first visit" vs "return" pricing |
| **Beauty salons** | Corte (cut), Coloracao (color), Manicure, Sobrancelha (brow) | 30-180 min | Long appointments, often chain-bookable |
| **Barbershops** | Corte, Barba (beard), Combo | 20-60 min | High volume, short slots |
| **Lawyers** | Consulta inicial, Acompanhamento | 30-60 min | Lower volume, higher value |
| **Psychologists** | Sessao (session) | 50-60 min | Fixed duration, recurring |
| **Personal trainers** | Treino (training), Avaliacao fisica | 45-90 min | Recurring schedules |

### 7.2 Scheduling Culture in Brazil

**Confidence: MEDIUM** (based on market knowledge, harder to verify with web sources)

**Key cultural factors:**

1. **WhatsApp is king.** Brazil has 120M+ WhatsApp users. Businesses already communicate with clients via WhatsApp manually. ZapBot automates what they are already doing. This is a huge advantage -- there is no behavior change required.

2. **Informal confirmation culture.** Brazilians commonly confirm appointments the day before ("Oi, confirmando sua consulta amanha as 14h"). ZapBot automates this perfectly.

3. **High no-show rates.** Particularly in healthcare. Automated reminders via WhatsApp directly address this pain point.

4. **Lunch breaks matter.** Most Brazilian service businesses close for lunch between 12:00-14:00 (varies by region/business). The slot generation system MUST support split schedules.

5. **Saturday working hours.** Many clinics and salons operate on Saturday mornings (08:00-12:00). Per-day schedule configuration is important.

6. **"Encaixe" (squeeze-in) culture.** Patients often ask to be "squeezed in" between appointments. This is a manual override that the business owner handles. ZapBot should not prevent this -- the dashboard should allow manual appointment creation that ignores availability rules.

7. **CPF (tax ID) is often collected.** For medical/dental appointments, the patient's CPF is commonly required. The `collect` block with `fieldType: "cpf"` is already planned -- good.

8. **Horario de Brasilia.** ~93% of Brazil's population lives in the `America/Sao_Paulo` timezone (UTC-3). Brazil no longer observes daylight saving time (suspended in 2019). This simplifies timezone handling significantly.

### 7.3 Timezone Handling for Brazil

**Confidence: HIGH** (verified)

**Critical fact: Brazil does NOT observe daylight saving time.** This was suspended in 2019. The `America/Sao_Paulo` timezone is fixed at UTC-3 year-round.

**However,** this means the offset between Brazil and countries that DO observe DST (like the United States) changes seasonally. This is only relevant if ZapBot ever serves international clients, which is not in scope for MVP.

**Practical implications for ZapBot:**
- Store all times in UTC (already done -- `withTimezone: true` on all timestamp columns).
- Display times in `America/Sao_Paulo` by default.
- The `timezone` column in `calendar_configs` allows per-account override for the ~7% of Brazilian businesses in other timezones (Amazon time UTC-4, Acre time UTC-5, Fernando de Noronha UTC-2).
- **The current `generatePossibleSlots` function is buggy** because it uses JavaScript's `Date` which operates in the server's timezone. When the server runs in UTC (cloud deployment), slots will be generated 3 hours off. Use `Intl.DateTimeFormat` or a library like `date-fns-tz` to correctly handle timezone conversion.

### 7.4 Competitive Landscape in Brazil

**Confidence: LOW-MEDIUM** (based on general market knowledge)

| Competitor | Type | WhatsApp Integration | Notes |
|-----------|------|---------------------|-------|
| Doctoralia | Healthcare marketplace | Limited | Large platform but focused on discovery, not chatbot building |
| Clinicorp | Dental management | Basic | Full clinic management, not chatbot-focused |
| Zenvia | Communication platform | Native | Enterprise-focused, expensive for SMBs |
| Take Blip | Chatbot platform | Native | Established player, but complex/expensive |
| Agendor | CRM | Limited | CRM-first, scheduling is secondary |
| iClinic | Healthcare management | Basic | Clinic management, not chatbot |

**ZapBot's differentiation:** No-code WhatsApp chatbot builder with native scheduling. Most competitors are either scheduling-only (no chatbot) or chatbot-only (no scheduling). The combination in a simple, affordable package for SMBs is the value proposition.

---

## 8. Recommendations for ZapBot Roadmap

### 8.1 Phase Structure Implications

Based on this research, the scheduling feature should be built in these phases:

**Phase 1: Core Scheduling (MVP)**
- Fix timezone handling in slot generation (CRITICAL BUG)
- Implement token encryption for stored credentials
- Build the booking flow: show slots -> patient selects -> create event -> save appointment
- Implement double-booking prevention with `SELECT FOR UPDATE`
- Add minimum advance time filtering
- Submit WhatsApp message templates to Meta (do this EARLY)

**Phase 2: Reminders & Lifecycle**
- Build cron-based reminder system (24h + 2h before appointment)
- Implement cancellation flow via WhatsApp
- Implement rescheduling flow via WhatsApp
- Add confirmation tracking columns to schema
- Handle reminder delivery failures gracefully

**Phase 3: Multi-Provider & Advanced Scheduling**
- Support multiple professionals per business
- Per-day-of-week schedule configuration
- Lunch break / split schedule support
- Holiday/blocked date management
- Professional selection strategies (patient chooses vs. auto-assign)

**Phase 4: Calendar Sync & Intelligence (Post-MVP)**
- Provider interface abstraction (`CalendarProvider`)
- Google Calendar push notifications for real-time sync
- Local availability cache with sync tokens
- Outlook/Graph API provider (if demand exists)
- No-show tracking and analytics

### 8.2 Critical Bugs to Fix Before Shipping

1. **Timezone bug in `generatePossibleSlots`:** Uses JavaScript `Date` methods that depend on server timezone. Will produce wrong slots when deployed to UTC servers. Fix with `date-fns-tz` or `luxon`.

2. **No token encryption:** Refresh tokens stored in plaintext. Must implement AES-256-GCM encryption before any real user data is stored.

3. **No error differentiation in `refreshAccessToken`:** Cannot distinguish between temporary failures (retry) and permanent failures (re-auth needed).

### 8.3 Schema Changes Needed

```sql
-- Enhance calendar_configs
ALTER TABLE calendar_configs ADD COLUMN min_advance_minutes integer NOT NULL DEFAULT 120;
ALTER TABLE calendar_configs ADD COLUMN blocked_dates jsonb NOT NULL DEFAULT '[]';
ALTER TABLE calendar_configs ADD COLUMN min_cancellation_hours integer NOT NULL DEFAULT 2;
ALTER TABLE calendar_configs ADD COLUMN allow_patient_reschedule boolean NOT NULL DEFAULT true;

-- Enhance appointments with granular reminder tracking
ALTER TABLE appointments ADD COLUMN confirmation_sent_at timestamp with time zone;
ALTER TABLE appointments ADD COLUMN reminder_24h_sent_at timestamp with time zone;
ALTER TABLE appointments ADD COLUMN reminder_2h_sent_at timestamp with time zone;
ALTER TABLE appointments DROP COLUMN reminder_sent;

-- Add exclusion constraint for double-booking prevention (optional, strong guarantee)
-- Requires: CREATE EXTENSION IF NOT EXISTS btree_gist;
-- ALTER TABLE appointments ADD CONSTRAINT no_double_booking
--   EXCLUDE USING gist (
--     professional WITH =,
--     tstzrange(start_time, end_time) WITH &&
--   ) WHERE (status = 'confirmed');
```

### 8.4 Dependencies to Add

```bash
# Timezone handling (pick one)
pnpm --filter calendar add date-fns date-fns-tz
# OR
pnpm --filter calendar add luxon && pnpm --filter calendar add -D @types/luxon

# Recommended: date-fns-tz because it's lighter and tree-shakeable
```

### 8.5 Open Questions

1. **Should ZapBot support recurring appointments?** (e.g., weekly therapy sessions) -- Significant complexity increase. Defer to post-MVP.
2. **Should appointment types have different durations?** The schema already supports `durationRules` in `AppointmentConfig` -- this is good. Make sure the flow engine passes the right `sourceField` variable.
3. **How to handle Google Calendar API outages?** Should ZapBot fall back to local-only scheduling (book in DB without Google Calendar event, sync later)? This adds resilience but complexity.
4. **WhatsApp Flows vs. interactive messages for slot selection?** WhatsApp Flows could provide a richer UI for date/time picking. Worth investigating but adds Meta dependency.

---

## Sources

### Official Documentation (HIGH confidence)
- [Google Calendar API Quota Management](https://developers.google.com/workspace/calendar/api/guides/quota)
- [Google Calendar FreeBusy API Reference](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- [Google Calendar Push Notifications Guide](https://developers.google.com/workspace/calendar/api/guides/push)
- [Google Calendar Sync Guide](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google OAuth 2.0 Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Google OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Calendar API Auth Scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google Calendar API Error Handling](https://developers.google.com/workspace/calendar/api/guides/errors)
- [WhatsApp Business Platform](https://business.whatsapp.com/products/business-platform)
- [WhatsApp Platform Pricing](https://business.whatsapp.com/products/platform-pricing)

### Industry Sources (MEDIUM confidence)
- [Appointment Scheduling Algorithm - Baeldung](https://www.baeldung.com/cs/appointment-scheduling-algorithm)
- [Understanding Slot Duration and Buffer Settings - GoHighLevel](https://help.gohighlevel.com/support/solutions/articles/48001155718-understanding-slot-duration-slot-interval-and-buffer-settings)
- [Best Calendar APIs 2025 Comparison - Cronofy](https://www.cronofy.com/blog/best-calendar-apis)
- [Nylas Calendar API](https://www.nylas.com/products/calendar-api/)
- [WhatsApp Appointment Reminders - DoubleTick](https://doubletick.io/blog/implementing-whatsapp-business-api-for-appointment-reminders-and-confirmations)
- [WhatsApp Business API Pricing 2026 - FlowCall](https://flowcall.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp API Pricing Update July 2025 - YCloud](https://www.ycloud.com/blog/whatsapp-api-pricing-update)
- [Time in Brazil - Wikipedia](https://en.wikipedia.org/wiki/Time_in_Brazil)
- [Brazil Dental Practice Management Software Market - Grand View Research](https://www.grandviewresearch.com/horizon/outlook/dental-practice-management-software-market/brazil)

### Community/Blog Sources (LOW-MEDIUM confidence)
- [Google Calendar OAuth Token Handling - Logto Blog](https://blog.logto.io/google-api-access-with-token-storage)
- [Google Calendar Sync Implementation - Ensolvers](https://www.ensolvers.com/post/implementing-calendar-synchronization-with-google-calendar-api)
- [Google Calendar Webhooks with Node.js - Stateful](https://stateful.com/blog/google-calendar-webhooks)
- [PostgreSQL Explicit Locking Documentation](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Concurrency in Booking Systems - Medium](https://medium.com/@abhishekranjandev/concurrency-conundrum-in-booking-systems-2e53dc717e8c)
- [Chatbot Appointment Scheduling - Typebot](https://typebot.io/blog/appointment-scheduling-chatbot)
- [Booking Chatbot Build Guide - Botpress](https://botpress.com/blog/chatbot-for-bookings)
- [Calendar Webhook Integration Guide 2025 - CalendHub](https://calendhub.com/blog/calendar-webhook-integration-developer-guide-2025/)

---

*Research completed: 2026-02-17*

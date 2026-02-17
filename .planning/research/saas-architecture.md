# SaaS Multi-Tenant Architecture Research: ZapBot

**Domain:** Multi-tenant WhatsApp chatbot builder SaaS platform
**Researched:** 2026-02-17
**Overall Confidence:** HIGH (most findings verified with official docs and multiple sources)

---

## Table of Contents

1. [Multi-Tenant Data Isolation with Supabase](#1-multi-tenant-data-isolation-with-supabase)
2. [Supabase Auth Integration with Fastify](#2-supabase-auth-integration-with-fastify)
3. [Webhook Routing in Multi-Tenant Chatbot Platforms](#3-webhook-routing-in-multi-tenant-chatbot-platforms)
4. [Flow Execution Engine Patterns](#4-flow-execution-engine-patterns)
5. [Real-Time Features for Flow Editors](#5-real-time-features-for-flow-editors)
6. [Token Encryption at Rest](#6-token-encryption-at-rest)
7. [Deployment Patterns](#7-deployment-patterns)
8. [Monitoring and Observability](#8-monitoring-and-observability)
9. [Roadmap Implications](#9-roadmap-implications)

---

## 1. Multi-Tenant Data Isolation with Supabase

**Confidence: HIGH** (verified via Drizzle ORM official docs, Supabase official docs, drizzle-supabase-rls reference implementation)

### Recommendation: RLS with account_id column filtering (hybrid approach)

ZapBot's existing schema already has `account_id` on every tenant-scoped table. The recommended approach is a **hybrid** strategy:

1. **Row-Level Security (RLS) as the safety net** -- enforced at the database level
2. **Application-level account_id filtering via Drizzle ORM** -- for explicit query scoping and performance control
3. **Service-role bypass for webhooks and background jobs** -- since incoming WhatsApp webhooks have no user JWT

### Why NOT schema-per-tenant

Schema-per-tenant creates a separate PostgreSQL schema for each business. This approach is **wrong for ZapBot** because:

- **Scale mismatch**: ZapBot targets many small businesses (hundreds to thousands of tenants). Schema-per-tenant works for 10-50 large enterprise tenants, not thousands of SMBs.
- **Migration nightmare**: Every schema change must be applied to every tenant schema. With 500+ tenants, this becomes operationally expensive.
- **Connection pooling**: Each schema effectively needs its own connection context, which defeats Supabase's connection pooling.
- **Supabase RLS is built for shared-table multi-tenancy**: The entire Supabase Auth system expects shared tables with RLS policies.

### Why NOT pure application-level filtering (no RLS)

Pure application-level filtering (just adding `.where(eq(table.accountId, accountId))` in every query) is **insufficient** because:

- A single missed filter in any query leaks data across tenants.
- Supabase exposes tables through its PostgREST API by default -- without RLS, any authenticated user can query any tenant's data directly through the Supabase client.
- There is no database-level safety net.

### Recommended RLS Implementation with Drizzle ORM

Drizzle ORM now has native RLS support (verified from official docs at orm.drizzle.team/docs/rls). Here is the pattern:

#### Step 1: Define RLS policies in Drizzle schema

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  flowJson: jsonb("flow_json").notNull(),
  // ... other columns
}, (table) => [
  index("bots_account_idx").on(table.accountId),

  // RLS: Users can only see bots belonging to their account
  pgPolicy("bots_select_policy", {
    for: "select",
    to: authenticatedRole,
    using: sql`account_id = (
      SELECT id FROM accounts
      WHERE supabase_user_id = auth.uid()
    )`,
  }),

  pgPolicy("bots_insert_policy", {
    for: "insert",
    to: authenticatedRole,
    withCheck: sql`account_id = (
      SELECT id FROM accounts
      WHERE supabase_user_id = auth.uid()
    )`,
  }),

  pgPolicy("bots_update_policy", {
    for: "update",
    to: authenticatedRole,
    using: sql`account_id = (
      SELECT id FROM accounts
      WHERE supabase_user_id = auth.uid()
    )`,
    withCheck: sql`account_id = (
      SELECT id FROM accounts
      WHERE supabase_user_id = auth.uid()
    )`,
  }),

  pgPolicy("bots_delete_policy", {
    for: "delete",
    to: authenticatedRole,
    using: sql`account_id = (
      SELECT id FROM accounts
      WHERE supabase_user_id = auth.uid()
    )`,
  }),
]);
```

#### Step 2: Create dual Drizzle clients (Admin + RLS)

Based on the drizzle-supabase-rls reference implementation (github.com/rphlmr/drizzle-supabase-rls):

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

// Admin client -- bypasses RLS (for webhooks, background jobs, cron)
const adminConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
export const adminDb = drizzle(adminConnection);

// RLS client -- enforces RLS policies within transactions
const rlsConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
const rlsClient = drizzle(rlsConnection);

type SupabaseToken = {
  sub: string;
  role: string;
  // ... other JWT claims
};

export function createAuthenticatedDb(token: SupabaseToken) {
  return {
    admin: adminDb,
    rls: (async (transaction, ...rest) => {
      return await rlsClient.transaction(async (tx) => {
        try {
          // Set JWT context so RLS policies can use auth.uid()
          await tx.execute(sql`
            SELECT set_config('request.jwt.claims', '${sql.raw(
              JSON.stringify(token)
            )}', TRUE);
            SELECT set_config('request.jwt.claim.sub', '${sql.raw(
              token.sub ?? ""
            )}', TRUE);
            SET LOCAL ROLE ${sql.raw(token.role ?? "anon")};
          `);
          return await transaction(tx);
        } finally {
          await tx.execute(sql`
            SELECT set_config('request.jwt.claims', NULL, TRUE);
            SELECT set_config('request.jwt.claim.sub', NULL, TRUE);
            RESET ROLE;
          `);
        }
      }, ...rest);
    }) as typeof rlsClient.transaction,
  };
}
```

#### Step 3: Use appropriately in routes

```typescript
// Frontend-facing routes: Use RLS client
fastify.get("/api/v1/bots", {
  onRequest: [verifyJwt],
  handler: async (request) => {
    const db = createAuthenticatedDb(request.user);
    return db.rls((tx) => tx.select().from(bots));
    // RLS automatically filters to the user's account
  }
});

// Webhook handler: Use admin client (no JWT available)
fastify.post("/webhooks/whatsapp", async (request) => {
  // Incoming webhooks have no JWT -- use admin with explicit filtering
  const connection = await adminDb.select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.phoneNumberId, phoneNumberId));
  // ...
});
```

### Critical Caveats

1. **`prepare: false` is mandatory**: Supabase's connection pooler in Transaction mode does not support prepared statements. Without this flag, you get "prepared statement already exists" errors in production.

2. **RLS context only persists within a transaction**: `set_config` and `SET LOCAL ROLE` are scoped to the transaction. Queries outside a transaction see anonymous role context.

3. **Index the `account_id` column on every table**: RLS policies evaluate per-row. Without indexes on `account_id`, queries become full table scans filtered by RLS.

4. **Performance optimization**: Consider creating a helper function `get_my_account_id()` as a PostgreSQL function that does the account lookup once per request context instead of per-policy evaluation.

### Sources

- [Drizzle ORM RLS Documentation](https://orm.drizzle.team/docs/rls)
- [drizzle-supabase-rls Reference Implementation](https://github.com/rphlmr/drizzle-supabase-rls)
- [Supabase RLS Feature Page](https://supabase.com/features/row-level-security)
- [Supabase Token Security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [MakerKit: Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)

---

## 2. Supabase Auth Integration with Fastify

**Confidence: HIGH** (verified via fastify-supabase GitHub repo, @fastify/jwt docs, Supabase JWT docs)

### Recommendation: Use @psteinroe/fastify-supabase plugin + @fastify/jwt

There is a purpose-built Fastify plugin that handles Supabase JWT verification and provides both service-role and user-authenticated Supabase clients.

### Implementation Pattern

#### Step 1: Install dependencies

```bash
pnpm add @psteinroe/fastify-supabase @fastify/jwt @supabase/supabase-js
```

#### Step 2: Register plugins

```typescript
import fastifyJWT from "@fastify/jwt";
import fastifySupabase from "@psteinroe/fastify-supabase";

// Register JWT verification with Supabase's JWT secret
await app.register(fastifyJWT, {
  secret: process.env.SUPABASE_JWT_SECRET!, // From Supabase dashboard > Settings > API
});

// Register Supabase plugin
await app.register(fastifySupabase, {
  url: process.env.SUPABASE_URL!,
  anonKey: process.env.SUPABASE_ANON_KEY!,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});
```

#### Step 3: Create auth middleware

```typescript
import { onRequestHookHandler } from "fastify";

// JWT verification hook
export const requireAuth: onRequestHookHandler = async (request) => {
  await request.jwtVerify();
};

// Optional: Account resolution hook (resolves account_id from JWT)
export const resolveAccount: onRequestHookHandler = async (request) => {
  await request.jwtVerify();
  const supabaseUserId = request.user.sub;

  // Look up the account for this Supabase user
  const [account] = await adminDb
    .select()
    .from(accounts)
    .where(eq(accounts.supabaseUserId, supabaseUserId));

  if (!account) {
    throw app.httpErrors.forbidden("No account found for this user");
  }

  // Attach to request for downstream use
  request.account = account;
};
```

#### Step 4: Apply to routes

```typescript
// Protected route with user's Supabase client
app.get("/api/v1/bots", {
  onRequest: [requireAuth],
  handler: async (request, reply) => {
    // request.supabaseClient is authenticated as the user
    // request.user contains the decoded JWT
    // ...
  },
});

// Unprotected route (webhooks)
app.post("/webhooks/whatsapp", async (request, reply) => {
  // No auth middleware -- webhooks come from Meta, not users
  // Use fastify.supabaseClient (service role) for database access
});
```

### Where to get the JWT secret

The Supabase JWT secret is found at: **Supabase Dashboard > Project Settings > API > JWT Secret**. This is distinct from the anon key and service role key.

### Account Resolution Strategy

ZapBot has a `supabase_user_id` column on the `accounts` table. The JWT's `sub` claim contains the Supabase user ID. The resolution flow:

1. User authenticates via Supabase Auth (frontend)
2. Frontend sends JWT in `Authorization: Bearer <token>` header
3. Fastify verifies JWT using `@fastify/jwt`
4. Extract `sub` from JWT to get Supabase user ID
5. Look up `accounts` table by `supabase_user_id` to get `account_id`
6. Use `account_id` for all subsequent queries

### Performance Consideration: Cache the account lookup

The account resolution query happens on every request. Consider caching it:

```typescript
// Simple in-memory LRU cache for account lookups
// TTL of 5 minutes is reasonable -- account data rarely changes
import { LRUCache } from "lru-cache";

const accountCache = new LRUCache<string, Account>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
});
```

### Sources

- [fastify-supabase Plugin](https://github.com/psteinroe/fastify-supabase)
- [@fastify/jwt](https://github.com/fastify/fastify-jwt)
- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts)
- [Supabase JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)

---

## 3. Webhook Routing in Multi-Tenant Chatbot Platforms

**Confidence: HIGH** (verified via WhatsApp Cloud API documentation, existing codebase analysis)

### The Routing Problem

ZapBot uses a **single webhook endpoint** to receive messages for **all tenants**. When Meta sends a webhook event, ZapBot must determine which tenant (account) and which bot should handle it.

### Recommendation: Route by phone_number_id from webhook metadata

The WhatsApp Cloud API webhook payload includes the `phone_number_id` in the metadata of every message event. This is the key for tenant routing.

### Webhook Payload Structure

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5511999999999",
          "phone_number_id": "123456789"
        },
        "contacts": [{
          "profile": { "name": "Customer Name" },
          "wa_id": "5511888888888"
        }],
        "messages": [{
          "from": "5511888888888",
          "id": "wamid.xxx",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Hello" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Routing Flow

```
Incoming Webhook
    |
    v
1. Verify webhook signature (HMAC-SHA256 with app_secret)
    |
    v
2. Return 200 immediately (prevent Meta retries)
    |
    v
3. Extract phone_number_id from entry[].changes[].value.metadata
    |
    v
4. Look up whatsapp_connections table:
   WHERE phone_number_id = extracted_phone_number_id
   => Get account_id
    |
    v
5. Look up active published bot for that account:
   WHERE account_id = resolved_account_id AND status = 'published'
   => Get bot_id and flow_json
    |
    v
6. Find or create conversation:
   WHERE account_id = resolved_account_id
     AND contact_phone = message.from
     AND status = 'active'
   => Get or create conversation with current_node_id and variables
    |
    v
7. Execute flow engine with (flow_json, conversation_state, parsed_message)
    |
    v
8. Send response messages via WhatsApp API (using tenant's access_token)
    |
    v
9. Update conversation state in database
```

### Implementation

```typescript
app.post("/webhooks/whatsapp", async (request, reply) => {
  // Always respond immediately
  reply.status(200).send("EVENT_RECEIVED");

  const body = request.body as { object: string; entry: WebhookEntry[] };

  // Verify signature
  const signature = request.headers["x-hub-signature-256"] as string;
  if (!verifySignature(request.rawBody, signature, process.env.WHATSAPP_APP_SECRET!)) {
    request.log.warn("Invalid webhook signature");
    return;
  }

  // Process each entry (usually just one)
  for (const entry of body.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const { metadata, messages, contacts } = change.value;
      if (!messages?.length) continue;

      const phoneNumberId = metadata.phone_number_id;

      // Tenant resolution
      const [connection] = await adminDb
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.phoneNumberId, phoneNumberId));

      if (!connection) {
        request.log.warn({ phoneNumberId }, "No connection found for phone_number_id");
        continue;
      }

      // Process message with tenant context
      await processMessage({
        accountId: connection.accountId,
        connection,
        message: messages[0],
        contact: contacts?.[0],
      });
    }
  }
});
```

### Webhook Verification Token: Multi-Tenant Consideration

The current schema has a `webhook_verify_token` per WhatsApp connection. However, WhatsApp Cloud API registers a **single webhook URL per Meta App**, not per phone number. This means:

- **All tenants share one webhook URL** (e.g., `https://api.zapbot.com/webhooks/whatsapp`)
- **The verify token is per Meta App**, not per tenant
- **Routing is done at message-processing time**, not at webhook registration

If ZapBot uses a single Meta App (recommended for SaaS), then:
- One global `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for the app
- Each tenant connects their phone number to the shared Meta App (via Embedded Signup or manual WABA sharing)
- The per-tenant `webhook_verify_token` in the schema is unnecessary for the webhook GET verification, but could be used for other verification purposes

### Idempotency

WhatsApp may retry webhooks if response is slow. Use `wa_message_id` for idempotency:

```typescript
// Before processing, check if we already handled this message
const existing = await adminDb
  .select()
  .from(messages)
  .where(eq(messages.waMessageId, incomingMessage.id))
  .limit(1);

if (existing.length > 0) {
  request.log.info({ waMessageId: incomingMessage.id }, "Duplicate message, skipping");
  return;
}
```

### Performance: Cache Tenant Lookups

The phone_number_id to account_id mapping rarely changes. Cache it:

```typescript
const connectionCache = new LRUCache<string, WhatsAppConnection>({
  max: 500,
  ttl: 10 * 60 * 1000, // 10 minutes
});

async function resolveConnection(phoneNumberId: string) {
  let connection = connectionCache.get(phoneNumberId);
  if (!connection) {
    [connection] = await adminDb
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.phoneNumberId, phoneNumberId));
    if (connection) {
      connectionCache.set(phoneNumberId, connection);
    }
  }
  return connection;
}
```

### Sources

- [WhatsApp Cloud API Webhook Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [ChatArchitect: Scalable Webhook Architecture](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Existing WhatsApp client code in packages/whatsapp/src/index.ts]

---

## 4. Flow Execution Engine Patterns

**Confidence: HIGH** (analyzed existing codebase + research on state machine patterns)

### Assessment of Current Engine

ZapBot's existing `FlowEngine` class in `apps/engine/src/services/flow-engine.ts` is already a solid **graph-walking interpreter** pattern. It:

- Stores conversation state externally (database) -- no in-memory state
- Walks a node graph using a `nodeMap` (Map of node ID to FlowNode)
- Handles multiple node types (message, buttons, list, collect, appointment, condition, handoff, wait)
- Supports auto-advancing through non-interactive nodes (message, condition)
- Produces side effects declaratively (track_event, book_appointment, handoff)

### Recommendation: Keep the current interpreter pattern, do NOT introduce XState

**Why not XState or formal state machine libraries:**

1. **ZapBot's flow graph is data-driven, not code-driven.** The flow is defined as JSON by non-technical users in a visual editor. XState machines are defined in code. Translating user-created JSON to XState machine definitions adds complexity without benefit.

2. **The conversation state is simple**: current_node_id + variables. There is no parallel state, no nested state machines, no history states. A full statechart library is overkill.

3. **Stateless execution**: Each webhook triggers a fresh engine instance. The engine loads the flow JSON, processes one message, updates state, and exits. XState's actor model assumes long-lived processes.

4. **The existing pattern is correct**: A graph-walking interpreter that produces outputs and side effects is exactly the right pattern for a webhook-driven chatbot.

### Improvements to the Current Engine

The existing engine is a scaffold that needs these enhancements:

#### 4.1 Input Validation for Collect Nodes

```typescript
case "collect": {
  if (currentNode.field) {
    const value = message.text;
    const isValid = this.validateField(value, currentNode.fieldType);
    if (!isValid) {
      output.messages.push({
        type: "text",
        body: this.getValidationErrorMessage(currentNode.fieldType),
      });
      return null; // Stay on same node
    }
    output.state.variables[currentNode.field] = value;
  }
  return currentNode.next || null;
}

private validateField(value: string, fieldType?: FieldType): boolean {
  switch (fieldType) {
    case "phone":
      return /^\d{10,13}$/.test(value.replace(/\D/g, ""));
    case "cpf":
      return this.validateCPF(value);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "date":
      return !isNaN(Date.parse(value));
    case "number":
      return !isNaN(Number(value));
    default:
      return value.trim().length > 0;
  }
}
```

#### 4.2 Appointment Sub-Flow (State Within a State)

The appointment node is the most complex -- it requires multiple back-and-forth messages (show availability, select slot, confirm). The current engine treats it as a single node. Recommend implementing it as a **sub-state machine within the appointment node**:

```typescript
// Conversation variables track appointment sub-state:
// _appointment_step: "showing_days" | "showing_slots" | "confirming" | "done"
// _appointment_selected_date: string
// _appointment_selected_slot: string

case "appointment": {
  const step = output.state.variables["_appointment_step"];

  switch (step) {
    case undefined:
    case "showing_days":
      // Side effect: fetch availability
      output.sideEffects.push({ type: "fetch_availability", config: node.config || {} });
      output.state.variables["_appointment_step"] = "showing_days";
      return null; // Wait for availability data, then show days

    case "showing_slots":
      // User selected a day, now show time slots
      output.state.variables["_appointment_selected_date"] = message.text;
      // ... show slots for that day
      output.state.variables["_appointment_step"] = "confirming";
      return null;

    case "confirming":
      // User selected a slot, book it
      output.sideEffects.push({ type: "book_appointment", data: { ... } });
      output.state.variables["_appointment_step"] = "done";
      return node.next || null;
  }
}
```

#### 4.3 Timeout Handling

Conversations expire if the user stops responding. This should be handled by a background job (cron), not the engine:

```typescript
// Cron job: Every 15 minutes, expire stale conversations
const staleConversations = await adminDb
  .select()
  .from(conversations)
  .where(
    and(
      eq(conversations.status, "active"),
      lt(conversations.lastMessageAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
    )
  );

for (const conv of staleConversations) {
  await adminDb
    .update(conversations)
    .set({ status: "expired" })
    .where(eq(conversations.id, conv.id));
}
```

#### 4.4 Error Recovery

Add a maximum execution depth to prevent infinite loops in misconfigured flows:

```typescript
private executeNode(node: FlowNode, message: ParsedMessage, output: EngineOutput, depth = 0): EngineOutput {
  if (depth > 50) {
    output.messages.push({ type: "text", body: "Desculpe, ocorreu um erro no fluxo." });
    output.state.status = "completed";
    return output;
  }
  // ... existing logic with depth + 1 on recursive calls
}
```

### Sources

- [Existing FlowEngine code at apps/engine/src/services/flow-engine.ts]
- [State Machine Based Human-Bot Conversation Model (Academic)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7266438/)
- [Haptik: Finite State Machines for Chatbots](https://www.haptik.ai/tech/finite-state-machines-to-the-rescue/)
- [XState Documentation](https://stately.ai/docs/xstate) -- evaluated but not recommended

---

## 5. Real-Time Features for Flow Editors

**Confidence: MEDIUM** (Supabase Realtime limits verified, collaborative editing patterns from multiple sources, but flow-editor-specific implementations are less documented)

### Assessment: Defer collaborative editing, use Supabase Realtime for live preview

For MVP, real-time collaborative editing (multiple users editing the same flow simultaneously) is **out of scope**. ZapBot targets small businesses where typically one person manages the bot. The value of real-time features is:

1. **Live preview in phone simulator** -- HIGH value, implement in MVP
2. **Auto-save with conflict detection** -- HIGH value, implement in MVP
3. **Collaborative editing** -- LOW value for target market, defer to post-MVP

### 5.1 Live Preview (MVP)

The phone simulator should update in real-time as the user edits the flow. This is purely **client-side** -- no backend needed:

```typescript
// React state management with Zustand
const useFlowStore = create((set) => ({
  flow: initialFlow,
  updateNode: (nodeId, updates) =>
    set((state) => ({
      flow: {
        ...state.flow,
        nodes: state.flow.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...updates } : n
        ),
      },
    })),
}));

// Phone simulator subscribes to the same store
// Changes are reflected instantly
```

### 5.2 Auto-Save with Supabase Realtime (MVP)

Use debounced auto-save with Supabase Realtime for conflict detection:

```typescript
// Auto-save: Debounce flow changes, save to Supabase
const debouncedSave = useDebouncedCallback(async (flow: BotFlow) => {
  const { error } = await supabase
    .from("bots")
    .update({ flow_json: flow, updated_at: new Date().toISOString() })
    .eq("id", botId);

  if (error) {
    // Handle optimistic locking conflict
    toast.error("Erro ao salvar. Recarregue a pagina.");
  }
}, 2000);

// Subscribe to changes (detect if another session modified the same bot)
const channel = supabase
  .channel(`bot:${botId}`)
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "bots",
    filter: `id=eq.${botId}`,
  }, (payload) => {
    if (payload.new.updated_at > localLastSavedAt) {
      // Another session saved -- warn the user
      toast.warning("Este bot foi editado em outra sessao.");
    }
  })
  .subscribe();
```

### 5.3 Collaborative Editing (Post-MVP)

If needed later, the approach would be:

- **Supabase Realtime Presence** for showing who is editing (cursor indicators)
- **Supabase Realtime Broadcast** for sending cursor positions and selection state
- **Operational Transform or CRDT (Y.js + Hocuspocus)** for true collaborative editing of the flow JSON

However, this is significant complexity. For the target market of small businesses, a simpler approach is likely sufficient: **last-write-wins with conflict notification**.

### Supabase Realtime Limits (Free Tier)

| Limit | Free | Pro |
|-------|------|-----|
| Concurrent connections | 200 | 500 |
| Messages/second | 100 | 500 |
| Presence messages/second | 20 | 50 |
| Broadcast payload | 256 KB | 256 KB |
| Channels per connection | 100 | 100 |

For MVP with auto-save and conflict detection, the free tier is more than sufficient. Each user editing a bot creates 1 connection and generates minimal messages.

### Sources

- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Realtime Broadcast](https://supabase.com/features/realtime-broadcast)
- [Supabase Realtime Presence](https://supabase.com/features/realtime-presence)
- [Hocuspocus + Supabase for Collaborative Editing](https://emergence-engineering.com/blog/hocuspocus-with-supabase)

---

## 6. Token Encryption at Rest

**Confidence: HIGH** (verified via Node.js crypto official docs, OWASP guidelines, multiple implementation references)

### Recommendation: AES-256-GCM with Node.js built-in crypto module

The schema already has `access_token_encrypted` and `google_refresh_token_encrypted` columns. The CLAUDE.md specifies `ENCRYPTION_KEY` environment variable (32-byte hex). Use AES-256-GCM because it provides both encryption and authentication (integrity verification).

### Implementation

```typescript
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string.
 * Returns: base64(iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string, keyHex?: string): string {
  const key = Buffer.from(keyHex || process.env.ENCRYPTION_KEY!, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(encryptedBase64: string, keyHex?: string): string {
  const key = Buffer.from(keyHex || process.env.ENCRYPTION_KEY!, "hex");
  const data = Buffer.from(encryptedBase64, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
```

### Key Management

```bash
# Generate a secure encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store the `ENCRYPTION_KEY` in:
- **Development**: `.env` file (gitignored)
- **Production**: Platform environment variables (Railway/Render secrets)
- **Future**: Consider a secrets manager (AWS Secrets Manager, HashiCorp Vault) if regulatory requirements demand it

### Key Rotation Strategy

For future key rotation, include a key version prefix in the encrypted value:

```typescript
// Format: v1:base64(iv + authTag + ciphertext)
export function encryptWithVersion(plaintext: string): string {
  const encrypted = encrypt(plaintext);
  return `v1:${encrypted}`;
}

export function decryptWithVersion(value: string): string {
  const [version, encrypted] = value.split(":", 2);
  switch (version) {
    case "v1":
      return decrypt(encrypted, process.env.ENCRYPTION_KEY!);
    case "v2":
      return decrypt(encrypted, process.env.ENCRYPTION_KEY_V2!);
    default:
      // Legacy: no version prefix, assume v1
      return decrypt(value, process.env.ENCRYPTION_KEY!);
  }
}
```

### Where to Place This Code

Create a new package or utility file: `packages/db/src/crypto.ts` or a shared `packages/utils/src/crypto.ts`. It should be used by:
- WhatsApp connection creation (encrypt access token)
- Calendar config creation (encrypt refresh token)
- Flow engine at runtime (decrypt tokens to make API calls)

### Sources

- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [OWASP Node.js Cryptography Practices](https://www.nodejs-security.com/blog/owasp-nodejs-authentication-authorization-cryptography-practices)
- [AES-256-GCM Node.js Gist](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81)
- [encrypt-at-rest npm package](https://github.com/zachelrath/encrypt-at-rest)

---

## 7. Deployment Patterns

**Confidence: HIGH** (verified via Railway official docs, platform comparison articles from 2025-2026)

### Recommendation: Railway for the engine, Vercel for the frontend

Given ZapBot's constraints (bootstrap startup, cost-conscious, ship fast), here is the recommended deployment architecture:

### Architecture

```
                    Internet
                       |
          +------------+------------+
          |                         |
    Vercel (Frontend)        Railway (Engine)
    - Next.js App Router     - Fastify server
    - Static assets + SSR    - WhatsApp webhooks
    - Supabase Auth UI       - Flow execution
          |                         |
          +------------+------------+
                       |
                  Supabase Cloud
                  - PostgreSQL database
                  - Auth service
                  - Realtime (WebSocket)
                  - Storage (if needed)
```

### Why Railway for the Engine

| Platform | Free Tier | Node.js Support | WebSocket | Pros | Cons |
|----------|-----------|-----------------|-----------|------|------|
| **Railway** | $5/mo credit (~500 CPU-hrs) | Excellent | Yes | Fast deploy, git integration, easy env vars, good DX | Requires credit card |
| Render | 750 free instance-hrs | Good | Yes | Generous free tier | Free instances spin down after inactivity (cold starts = lost webhooks) |
| Fly.io | $5 credit (one-time) | Good | Yes | Edge deployment, global | More complex setup (fly.toml), no longer truly free |
| Vercel | Generous for frontend | Serverless only | Limited | Great for Next.js | Not suitable for long-running webhook server |

**Railway wins because:**
1. **Always-on**: No cold starts. WhatsApp webhooks must respond within seconds or Meta retries.
2. **Simple deployment**: `git push` deploys automatically.
3. **Environment variables UI**: Easy to manage secrets.
4. **WebSocket support**: For future Supabase Realtime proxy or direct WebSocket connections.
5. **Cost**: $5/month is within budget for a bootstrap startup.

**Render's free tier is dangerous for webhooks** because free instances spin down after 15 minutes of inactivity. A cold start takes 30-60 seconds. Meta's webhook timeout is much shorter, and it will retry with exponential backoff, potentially causing duplicate message processing.

### Why Vercel for the Frontend

- Next.js is a Vercel product -- best-in-class integration
- Free tier is generous for frontend workloads
- Edge runtime for SSR
- Automatic preview deployments for PRs
- The CLAUDE.md already specifies Next.js 14 App Router

### Railway Deployment Configuration

**Critical gotcha**: Fastify must bind to `::` or `0.0.0.0`, not `localhost`:

```typescript
// In apps/engine/src/server.ts
await app.listen({
  port: parseInt(process.env.PORT || "4000", 10),
  host: "::", // Required for Railway -- binds to all interfaces
});
```

Railway auto-detects `PORT` environment variable. Use `PORT` instead of `ENGINE_PORT` in production.

**Dockerfile for Railway:**

```dockerfile
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json package.json ./

# Copy package.json files for all workspace packages
COPY apps/engine/package.json ./apps/engine/
COPY packages/db/package.json ./packages/db/
COPY packages/whatsapp/package.json ./packages/whatsapp/
COPY packages/calendar/package.json ./packages/calendar/
COPY packages/flow-schema/package.json ./packages/flow-schema/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN pnpm turbo build --filter=engine...

# Production stage
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=base /app .
EXPOSE 4000
CMD ["node", "apps/engine/dist/server.js"]
```

### Supabase Cloud

Supabase provides managed PostgreSQL, Auth, Realtime, and Edge Functions. For ZapBot:

| Service | Free Tier Limit | ZapBot Usage | Sufficient? |
|---------|----------------|--------------|-------------|
| Database | 500 MB | Estimated <50 MB for first 6 months | Yes |
| Auth | 50,000 MAU | Target: <1,000 businesses initially | Yes |
| Realtime | 200 concurrent connections | Editor users + auto-save | Yes |
| Storage | 1 GB | Not used in MVP | Yes |
| Edge Functions | 500,000 invocations/mo | Not planned for MVP | Yes |

### Sources

- [Railway Fastify Deployment Guide](https://docs.railway.com/guides/fastify)
- [Railway vs Render](https://northflank.com/blog/railway-vs-render)
- [Railway vs Fly.io](https://docs.railway.com/platform/compare-to-fly)
- [Supabase Pricing](https://supabase.com/pricing)

---

## 8. Monitoring and Observability

**Confidence: MEDIUM** (patterns well-established, but specific tool choices for bootstrap startups less documented)

### Recommendation: Pino structured logging + tenant_id context + BetterStack/Axiom for log aggregation

For a bootstrap startup, full OpenTelemetry with Grafana/Prometheus is overkill. Start with structured logging that includes tenant context, then upgrade to traces when scale demands it.

### 8.1 Structured Logging with Tenant Context

Fastify uses Pino by default. Enhance it with tenant context:

```typescript
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    // In production, Pino outputs JSON by default (machine-readable)
    // In development, use pino-pretty for human-readable output
    ...(process.env.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    }),
  },
});

// Add tenant context to all request logs
app.addHook("onRequest", async (request) => {
  if (request.account) {
    request.log = request.log.child({
      accountId: request.account.id,
      businessName: request.account.businessName,
    });
  }
});

// For webhook processing, add context manually
async function processMessage(context: MessageContext) {
  const log = app.log.child({
    accountId: context.accountId,
    phoneNumberId: context.connection.phoneNumberId,
    contactPhone: context.message.from,
  });

  log.info("Processing incoming message");
  // All subsequent log.info/warn/error calls include tenant context
}
```

### 8.2 Key Metrics to Track

For a multi-tenant chatbot platform, these metrics matter most:

| Metric | How to Collect | Why |
|--------|----------------|-----|
| **Webhook processing time** | Pino log timing | Ensure <5s response to Meta |
| **Messages per tenant per day** | Analytics events table + SQL query | Usage-based billing, abuse detection |
| **Flow engine errors per tenant** | Structured error logs | Detect broken flows |
| **Conversation completion rate** | Analytics events (started vs completed) | Bot effectiveness |
| **WhatsApp API errors** | Log WhatsApp API response codes | Detect token expiry, rate limits |
| **Active conversations** | SQL count of active conversations | Capacity planning |

### 8.3 Log Aggregation (Free/Cheap Options)

| Service | Free Tier | Strengths | Best For |
|---------|-----------|-----------|----------|
| **BetterStack (formerly Logtail)** | 1 GB/month | Great UI, alerts, structured search | Bootstrap startups |
| **Axiom** | 500 GB/month ingest | Very generous free tier, OpenTelemetry support | Growing startups |
| Railway Observability | Included | Built-in, no setup | Quick start |
| Grafana Cloud | 50 GB logs, 10K metrics | Full observability stack | When you need dashboards |

**Recommendation**: Start with **Railway's built-in observability** (log viewing in the dashboard). When you need alerting and search, add **BetterStack or Axiom**. Both have Pino-compatible transports:

```bash
pnpm add @logtail/pino  # BetterStack
# or
pnpm add pino-axiom     # Axiom
```

### 8.4 Health Checks

The existing `/health` endpoint is a start. Enhance it:

```typescript
app.get("/health", async () => {
  const dbCheck = await adminDb.execute(sql`SELECT 1`).then(() => "ok").catch(() => "error");

  return {
    status: dbCheck === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  };
});
```

### 8.5 Alerting Priorities

Set up alerts for (in order of importance):

1. **Webhook processing failures** -- If webhooks fail, bots stop working for all tenants
2. **WhatsApp API errors (401/403)** -- Token expired or revoked
3. **Database connection failures** -- Everything stops
4. **High latency (>5s webhook processing)** -- Meta may start retrying
5. **Conversation error rate spike** -- Broken flow deployed

### 8.6 Per-Tenant Usage Dashboard (Post-MVP)

When building the analytics dashboard, query the `analytics_events` table for per-tenant metrics:

```sql
-- Messages per tenant per day
SELECT
  account_id,
  date_trunc('day', created_at) AS day,
  COUNT(*) FILTER (WHERE event_type = 'conversation_started') AS conversations,
  COUNT(*) FILTER (WHERE event_type = 'appointment_booked') AS appointments,
  COUNT(*) FILTER (WHERE event_type = 'drop_off') AS drop_offs
FROM analytics_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY account_id, day
ORDER BY day DESC;
```

### Sources

- [Pino + OpenTelemetry Integration](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0)
- [Pino Logger Guide 2026](https://signoz.io/guides/pino-logger/)
- [Multi-Tenant Observability with Grafana & Loki](https://sollybombe.medium.com/creating-multi-tenant-observability-dashboards-with-grafana-loki-2025-edition-85a673eff596)
- [New Relic: Monitoring Multi-Tenant SaaS](https://newrelic.com/blog/how-to-relic/monitoring-multi-tenant-saas-applications)

---

## 9. Roadmap Implications

### Suggested Phase Structure

Based on this research, here is how the findings should influence the roadmap:

#### Phase 1: Foundation (Auth + Data Layer + Encryption)

Build first because everything else depends on it.

- Implement Supabase Auth + Fastify JWT middleware (Section 2)
- Set up dual Drizzle clients (admin + RLS) (Section 1)
- Implement token encryption utilities (Section 6)
- Add RLS policies to all tenant-scoped tables (Section 1)
- Wire up webhook signature verification

**Rationale**: Auth and data isolation are prerequisites. Without them, no route is safe and no data is isolated.

#### Phase 2: Webhook + Flow Engine Core

Build next because this is the core product loop.

- Implement webhook routing by phone_number_id (Section 3)
- Enhance flow engine with input validation (Section 4)
- Implement appointment sub-flow state machine (Section 4)
- Add conversation lifecycle management
- Implement idempotent message processing

**Rationale**: The webhook-to-response pipeline is the heart of ZapBot. It must work before the editor matters.

#### Phase 3: Flow Editor Frontend

Build after the engine works end-to-end.

- React flow editor with Zustand state
- Phone simulator with live preview (Section 5.1)
- Auto-save with conflict detection (Section 5.2)
- Flow publish/pause lifecycle

**Rationale**: The editor is the user-facing product but it depends on a working engine to be testable.

#### Phase 4: Deployment + Observability

Concurrent with Phase 2-3, but formalize here.

- Railway deployment for engine (Section 7)
- Vercel deployment for frontend
- Structured logging with tenant context (Section 8)
- Health checks and basic alerting

**Rationale**: Need to be deployed to test WhatsApp webhooks (HTTPS required).

#### Phase 5: Polish + Analytics

After core loop works.

- Analytics dashboard with per-tenant metrics (Section 8.6)
- Conversation timeout handling (Section 4.3)
- Error recovery and flow validation in engine (Section 4.4)

### Research Flags

| Phase | Needs Deeper Research? | Topic |
|-------|----------------------|-------|
| Phase 1 | YES | Supabase Auth custom claims for team/role support |
| Phase 2 | YES | WhatsApp Embedded Signup flow for tenant onboarding |
| Phase 3 | NO | Standard React patterns, well-understood |
| Phase 4 | NO | Railway deployment is straightforward |
| Phase 5 | MAYBE | Analytics query optimization at scale |

### Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Multi-tenant RLS | HIGH | Verified with Drizzle ORM official docs + reference implementation |
| Auth integration | HIGH | Verified with fastify-supabase plugin source code |
| Webhook routing | HIGH | Verified with WhatsApp Cloud API docs + existing codebase |
| Flow engine | HIGH | Analyzed existing code, pattern is correct |
| Real-time features | MEDIUM | Supabase Realtime limits verified, but flow-editor-specific patterns less documented |
| Token encryption | HIGH | Standard Node.js crypto, well-documented |
| Deployment | HIGH | Railway docs verified, platform comparison confirmed |
| Observability | MEDIUM | Patterns well-known, but specific tool stack choices depend on growth trajectory |

### Open Questions

1. **WhatsApp Embedded Signup**: How do tenants connect their WhatsApp numbers? The Meta Embedded Signup flow for SaaS platforms needs separate research.
2. **Team access**: Current schema is single-user per account. If clinics need multiple staff members, the account model needs team/role support.
3. **Rate limiting**: Should ZapBot enforce per-tenant rate limits on the WhatsApp API to prevent one tenant from exhausting shared quotas?
4. **Background job processing**: For appointment reminders and conversation timeouts, a job queue (BullMQ + Redis or pg-boss with PostgreSQL) needs evaluation.
5. **LGPD compliance**: Brazilian data protection law (Lei Geral de Protecao de Dados) may require specific data handling patterns for storing customer phone numbers and conversation data.

---

*Generated: 2026-02-17*

# Phase 1: Foundation — Database, Auth & Project Scaffold - Research

**Researched:** 2026-02-17
**Domain:** Supabase Auth, Drizzle RLS, Fastify JWT middleware, Next.js frontend scaffold, AES-256-GCM encryption
**Confidence:** HIGH (most findings verified with official docs and cross-referenced sources)

---

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 1. No locked user decisions. Key project-level decisions from CLAUDE.md and STACK.md apply:

### Locked Decisions (from CLAUDE.md and STACK.md)
- **Auth**: Supabase Auth (Google OAuth + email/password)
- **Backend**: Fastify 5 + TypeScript, ESM modules
- **Database**: PostgreSQL via Supabase, Drizzle ORM (NOT Prisma)
- **ORM version**: drizzle-orm ^0.33.0, drizzle-kit ^0.24.0
- **Package manager**: pnpm 9.15.0 with Turborepo
- **Language**: All UI text in pt-BR; code/comments in English
- **Encryption**: AES-256-GCM with ENCRYPTION_KEY env var (32-byte hex)
- **Multi-tenancy**: account_id on every table, Supabase RLS enforced
- **Timeline**: Prototype speed (days, not weeks)

### Claude's Discretion
- Frontend framework: "Keep it simple — decide later" — user said focus on backend first. Frontend is minimal for Phase 1 exit criteria (user can register, log in, hit authenticated endpoint).
- Whether to create a minimal Next.js app shell or defer frontend entirely until Phase 1 backend works.

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Flow editor UI
- WhatsApp webhook pipeline
- Google Calendar integration
- Appointment booking
- Analytics dashboard
- Collaborative editing
- Background job queue

---

## Summary

Phase 1 establishes the entire security and data foundation. Every subsequent phase builds on it. The phase has five distinct technical concerns that must be implemented in dependency order: (1) database client setup with Drizzle config, (2) RLS policies on all tenant-scoped tables via Drizzle schema, (3) JWT verification middleware on Fastify routes, (4) AES-256-GCM token encryption utility, and (5) a minimal frontend shell with Supabase Auth.

The existing codebase is further along than it appears. The Drizzle schema is complete and correct, the Fastify server boots, and the CLAUDE.md documents every decision clearly. What's missing is the "glue": drizzle.config.ts, the database client instantiation, auth middleware, RLS policy definitions in the schema, the encryption utility, and the API routes for /api/v1/bots and /api/v1/account.

**IMPORTANT: Supabase JWT Migration (October 2025)** — Supabase changed new projects to use asymmetric JWT signing (ES256/RS256) by default on October 1, 2025. The old pattern of using @fastify/jwt with a static JWT secret (HS256) only works for projects created before that date. For projects created after October 2025 (which this project likely is), use the `jose` library with the JWKS endpoint instead. The existing saas-architecture.md recommends @psteinroe/fastify-supabase which wraps @fastify/jwt — verify which JWT algorithm your Supabase project uses before implementing.

**Primary recommendation:** Implement in this order: drizzle.config.ts → db client → RLS policies → auth middleware → encryption utility → API routes → minimal Next.js shell with login/register pages.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.33.0 | ORM + RLS policy definitions | Already in codebase, has native pgPolicy support |
| drizzle-kit | ^0.24.0 | Migration generation and Drizzle Studio | Already in codebase |
| postgres | ^3.4.0 | PostgreSQL driver | Already in codebase, required by drizzle |
| @supabase/supabase-js | ^2.x | Supabase client (auth, realtime) | Official Supabase SDK |
| @supabase/ssr | ^0.x | SSR-safe Supabase client for Next.js | Required for Next.js App Router cookie-based auth |
| jose | ^5.x | JWT verification via JWKS | Official Supabase recommendation for new projects (asymmetric JWT) |
| node:crypto | built-in | AES-256-GCM encryption | No dependency needed, well-documented |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/jwt | ^9.x | JWT decode + legacy HS256 verify | Only for Supabase projects created BEFORE Oct 2025 using HS256 |
| @psteinroe/fastify-supabase | latest | Fastify plugin wrapping Supabase client | Adds request.supabaseClient decorator — useful but optional |
| lru-cache | ^10.x | Cache account lookups | Prevents N+1 account resolution on every request |
| dotenv | ^16.4.0 | Environment variable loading | Already in codebase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose (JWKS) | @fastify/jwt (static secret) | @fastify/jwt works for HS256 legacy projects only; jose works for both old and new Supabase projects |
| Drizzle RLS (pgPolicy in schema) | Raw SQL migration files for RLS | Drizzle approach keeps policies version-controlled with the schema; SQL files are harder to maintain |
| node:crypto | libsodium-wrappers | libsodium is more opinionated but adds a dependency; node:crypto is built-in and sufficient |
| Next.js 14 | Minimal Vite React app | Next.js is the declared choice; a Vite app would be simpler but conflicts with CLAUDE.md decisions |

### Installation

```bash
# In apps/web (create this first)
pnpm --filter web add @supabase/supabase-js @supabase/ssr

# In apps/engine (add auth dependencies)
pnpm --filter engine add jose

# Optional: account lookup caching
pnpm --filter engine add lru-cache

# Generate lockfile (MISSING — run first)
cd zapbot-project/zapbot && pnpm install
```

---

## Architecture Patterns

### Recommended Project Structure for Phase 1

```
zapbot-project/zapbot/
├── packages/
│   └── db/
│       ├── src/
│       │   ├── schema/
│       │   │   └── index.ts          # Add pgPolicy calls to existing tables
│       │   ├── client.ts             # NEW: Export adminDb and createAuthenticatedDb
│       │   ├── crypto.ts             # NEW: encrypt() and decrypt() utilities
│       │   └── index.ts              # Barrel re-export (add client.ts and crypto.ts)
│       └── drizzle.config.ts         # NEW: Required for migrations to work
├── apps/
│   ├── engine/
│   │   └── src/
│   │       ├── server.ts             # Add auth middleware, mount API routes
│   │       ├── middleware/
│   │       │   └── auth.ts           # NEW: requireAuth hook using jose
│   │       └── routes/
│   │           ├── bots.ts           # NEW: GET/POST /api/v1/bots
│   │           └── account.ts        # NEW: GET /api/v1/account
│   └── web/                          # NEW: Next.js 14 app scaffold
│       ├── package.json
│       ├── next.config.ts
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx          # Redirect to /dashboard or /login
│       │   │   ├── login/
│       │   │   │   └── page.tsx      # Login form (email + Google OAuth button)
│       │   │   ├── register/
│   │   │   │   └── page.tsx          # Registration form
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Protected: shows account data
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── route.ts      # Supabase auth callback handler
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts         # Browser Supabase client
│   │   │   │   └── server.ts         # Server Component Supabase client
│   │   │   └── middleware.ts
│   │   └── middleware.ts             # Next.js middleware for session refresh
│       └── .env.local
```

### Pattern 1: drizzle.config.ts (MISSING — blocks all migrations)

This file does not exist and must be created before any migration commands work.

```typescript
// packages/db/drizzle.config.ts
// Source: https://orm.drizzle.team/docs/drizzle-config-file
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Tell drizzle-kit to exclude Supabase-managed roles from diff
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
```

### Pattern 2: Dual Drizzle Clients (admin + RLS-scoped)

```typescript
// packages/db/src/client.ts
// Source: https://github.com/rphlmr/drizzle-supabase-rls
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";

// CRITICAL: prepare: false required for Supabase connection pooler (Transaction mode)
const adminConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
export const adminDb = drizzle(adminConnection, { schema });

// RLS client — for user-scoped queries (RLS enforced within transactions)
const rlsConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
const rlsDb = drizzle(rlsConnection, { schema });

type JwtClaims = {
  sub: string;
  role: string;
  email?: string;
  [key: string]: unknown;
};

export function createAuthenticatedDb(claims: JwtClaims) {
  return {
    admin: adminDb,
    rls: (async (transaction, ...rest) => {
      return await rlsDb.transaction(async (tx) => {
        try {
          await tx.execute(sql`
            SELECT set_config('request.jwt.claims', '${sql.raw(
              JSON.stringify(claims)
            )}', TRUE);
            SELECT set_config('request.jwt.claim.sub', '${sql.raw(
              claims.sub ?? ""
            )}', TRUE);
            SET LOCAL ROLE ${sql.raw(claims.role ?? "anon")};
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
    }) as typeof rlsDb.transaction,
  };
}
```

### Pattern 3: RLS Policies in Drizzle Schema

Add `pgPolicy` calls to existing tables. The existing schema tables do NOT have RLS policies — they must be added now.

```typescript
// packages/db/src/schema/index.ts — example modification for bots table
// Source: https://orm.drizzle.team/docs/rls
import { pgPolicy } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { sql } from "drizzle-orm";

// Helper SQL expression — reuse across all tables
// Gets the account_id for the currently authenticated Supabase user
const myAccountId = sql`(
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)`;

export const bots = pgTable("bots", {
  // ... existing columns unchanged ...
}, (table) => [
  index("bots_account_idx").on(table.accountId),

  pgPolicy("bots_tenant_isolation", {
    for: "all",  // covers SELECT, INSERT, UPDATE, DELETE
    to: authenticatedRole,
    using: sql`account_id = ${myAccountId}`,
    withCheck: sql`account_id = ${myAccountId}`,
  }),
]);
```

Apply to: `whatsapp_connections`, `bots`, `bot_versions`, `calendar_configs`, `conversations`, `messages`, `appointments`, `analytics_events`.

The `accounts` table requires a different policy (users can only see their own account):

```typescript
export const accounts = pgTable("accounts", {
  // ... existing columns unchanged ...
}, (table) => [
  uniqueIndex("accounts_email_idx").on(table.email),
  uniqueIndex("accounts_supabase_user_idx").on(table.supabaseUserId),

  pgPolicy("accounts_tenant_isolation", {
    for: "all",
    to: authenticatedRole,
    using: sql`supabase_user_id = auth.uid()`,
    withCheck: sql`supabase_user_id = auth.uid()`,
  }),
]);
```

**Also required in the migration:** Enable RLS on each table. Drizzle handles `CREATE POLICY` but you need `enableRLS()` or a raw SQL migration to run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

```typescript
// In the table definition, add .enableRLS() if supported by your drizzle-orm version
// OR add a raw SQL migration:
// ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
// Repeat for every tenant-scoped table.
```

### Pattern 4: Fastify Auth Middleware (jose + JWKS)

**CRITICAL:** Supabase projects created after October 1, 2025 use asymmetric JWT signing (ES256) by default. Use `jose` with the JWKS endpoint, NOT @fastify/jwt with a static secret.

```typescript
// apps/engine/src/middleware/auth.ts
// Source: https://supabase.com/docs/guides/auth/jwts
import { jwtVerify, createRemoteJWKSet } from "jose";
import { onRequestHookHandler } from "fastify";
import { adminDb } from "@zapbot/db";
import { accounts } from "@zapbot/db";
import { eq } from "drizzle-orm";
import { LRUCache } from "lru-cache";

const SUPABASE_URL = process.env.SUPABASE_URL!;

// JWKS endpoint for asymmetric JWT verification
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// Cache account lookups — account data rarely changes, avoid N+1 per request
const accountCache = new LRUCache<string, typeof accounts.$inferSelect>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes
});

export const requireAuth: onRequestHookHandler = async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Token de autenticacao ausente", code: "MISSING_TOKEN" });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: "authenticated",
    });

    // Attach JWT claims to request for downstream use
    (request as Record<string, unknown>).jwtClaims = payload;

    // Resolve account from supabase_user_id
    const supabaseUserId = payload.sub!;
    let account = accountCache.get(supabaseUserId);

    if (!account) {
      const [found] = await adminDb
        .select()
        .from(accounts)
        .where(eq(accounts.supabaseUserId, supabaseUserId as `${string}-${string}-${string}-${string}-${string}`));

      if (!found) {
        return reply.status(403).send({ error: "Conta nao encontrada", code: "NO_ACCOUNT" });
      }

      account = found;
      accountCache.set(supabaseUserId, account);
    }

    (request as Record<string, unknown>).account = account;
  } catch (err) {
    request.log.warn({ err }, "JWT verification failed");
    return reply.status(401).send({ error: "Token invalido ou expirado", code: "INVALID_TOKEN" });
  }
};
```

**Note:** If you check your Supabase project settings and it was created before October 2025 using HS256, you can use @fastify/jwt with the JWT secret from Settings > API > JWT Secret. The `jose` approach works for both.

### Pattern 5: Account Creation on First Login (Supabase Auth Trigger)

When a new user registers via Supabase Auth, their account row must be created in the `accounts` table. Two approaches:

**Option A (Recommended for simplicity): Database trigger via Supabase Dashboard**

```sql
-- Run in Supabase SQL editor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (
    supabase_user_id,
    email,
    business_name
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'business_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

**Option B: Handle in the /api/v1/account POST endpoint**

On first authenticated request, if no account found, create one. This requires the frontend to make a POST to /api/v1/account after registration.

Option A is simpler and more reliable (atomic with the auth event).

### Pattern 6: Token Encryption Utility

```typescript
// packages/db/src/crypto.ts
// Source: https://nodejs.org/api/crypto.html
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;       // GCM standard
const AUTH_TAG_LENGTH = 16; // GCM standard

/**
 * Encrypts a plaintext string.
 * Storage format: base64(iv[12] + authTag[16] + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypts a previously encrypted string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const data = Buffer.from(encryptedBase64, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be set and be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}
```

Key generation command:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Pattern 7: Next.js Frontend Minimal Shell

The user said "focus on backend first" — the frontend for Phase 1 is minimal: just enough to satisfy the exit criteria (user can register, log in, hit an authenticated endpoint). Install `@supabase/ssr` for Next.js App Router (not the legacy `@supabase/auth-helpers-nextjs`).

```typescript
// apps/web/src/lib/supabase/server.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — middleware handles refresh
          }
        },
      },
    }
  );
}

// apps/web/src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Next.js middleware for session refresh (REQUIRED — without this, server-side auth breaks):

```typescript
// apps/web/src/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Always use getUser() not getSession() in server code
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  if (!user && !request.nextUrl.pathname.startsWith("/login") &&
      !request.nextUrl.pathname.startsWith("/register") &&
      !request.nextUrl.pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

### Pattern 8: Fastify Route Structure for Phase 1

```typescript
// apps/engine/src/routes/account.ts
import type { FastifyPluginAsync } from "fastify";
import { adminDb } from "@zapbot/db";
import { accounts } from "@zapbot/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/account — returns the authenticated user's account
  fastify.get("/", {
    onRequest: [requireAuth],
    handler: async (request) => {
      const account = (request as Record<string, unknown>).account;
      return { data: account };
    },
  });
};

export default accountRoutes;
```

### Anti-Patterns to Avoid

- **Using `getSession()` in server-side Next.js code**: `getSession()` does NOT verify the JWT on the server. Always use `getUser()` in middleware and server components.
- **Using @fastify/jwt with a static secret on new Supabase projects**: New projects (created after Oct 2025) use asymmetric JWT. The static secret approach will fail token verification.
- **Missing `prepare: false` on the postgres.js connection**: Supabase's connection pooler (Transaction mode) does not support prepared statements. Omitting this causes "prepared statement already exists" errors in production.
- **Querying outside a transaction with RLS client**: `set_config` for RLS context only persists within a transaction. Always use the rls client inside `db.rls(async (tx) => { ... })`.
- **Not enabling RLS on tables**: `CREATE POLICY` statements do nothing if `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` has not been run. Both are required.
- **Creating the account row in application code without a trigger**: Race conditions can create duplicate accounts. Use a database trigger or upsert.
- **Using schema-per-tenant**: Wrong for ZapBot. The existing shared-table approach with account_id is correct.

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWKS caching + rotation | Custom JWKS fetcher | `jose` createRemoteJWKSet | Handles key caching, rotation, and algorithm negotiation automatically |
| JWT parsing and verification | Manual base64 decode + signature check | `jose` jwtVerify | Handles algorithm negotiation, clock skew, audience, expiry |
| Supabase SSR cookie management | Custom cookie read/write | `@supabase/ssr` | Handles cookie refresh on server-side correctly; manual approach breaks session tracking |
| Encryption key validation | Ad-hoc key length check | Key validation function with clear error messages | Easy to get IV length, GCM tag length, or key format wrong |
| Account ID lookup per request | Inline DB query in every route | LRU cache (accountCache) | Without cache, every API request does a DB round-trip just to resolve account_id |
| RLS policy syntax | Raw SQL in migration files | Drizzle pgPolicy in schema | Keeps policies co-located with table definition, type-safe, version-controlled |

**Key insight:** The cryptographic and JWT pieces are exactly where "roll your own" creates critical security vulnerabilities. The existing Node.js crypto module (for AES-256-GCM) and `jose` (for JWT) cover everything needed without custom implementation risk.

---

## Common Pitfalls

### Pitfall 1: Supabase JWT Algorithm Mismatch

**What goes wrong:** Using @fastify/jwt with a static HS256 secret on a Supabase project that uses ES256 (asymmetric). Token verification fails silently or throws an opaque error.

**Why it happens:** Supabase changed default JWT signing algorithm for new projects to asymmetric ES256 on October 1, 2025. Old docs and many blog posts still show the HS256 + static secret approach.

**How to avoid:** Check your Supabase project's JWT settings. Go to Authentication > Settings > JWT. If you see "JWKS" or "ES256", use `jose` with the JWKS endpoint. If you see "JWT Secret" and HS256, @fastify/jwt with the static secret still works.

**Warning signs:** JWT verification fails even with a valid token; "alg" mismatch errors in logs.

### Pitfall 2: RLS Enabled But No Policy = 0 Rows Returned

**What goes wrong:** `ALTER TABLE bots ENABLE ROW LEVEL SECURITY` is run, but no `CREATE POLICY` exists for a specific operation. PostgreSQL's default is DENY ALL when RLS is enabled but no matching policy exists. Queries return 0 rows rather than an error.

**Why it happens:** RLS is enabled first, policies created second. Any gap between them silently blocks reads.

**How to avoid:** Run the RLS enable and policy creation in the same migration. Test immediately after applying: log in as a real user and query the table.

**Warning signs:** API returns empty arrays; no SQL errors thrown; works fine with the service role key.

### Pitfall 3: Missing `prepare: false` on postgres.js

**What goes wrong:** `Error: prepared statement "s1" already exists` in production (Railway, Supabase, any connection pooler).

**Why it happens:** Supabase's connection pooler (PgBouncer) in Transaction mode reuses connections across requests. Prepared statements from one request leak to the next connection context.

**How to avoid:** Always set `prepare: false` when creating the postgres.js connection for Supabase.

**Warning signs:** Works locally (direct connection) but fails in production or staging (pooled connection).

### Pitfall 4: `getSession()` vs `getUser()` in Server Code

**What goes wrong:** Server-side authentication silently passes for users with expired or invalid tokens.

**Why it happens:** `supabase.auth.getSession()` reads from the cookie without verifying the JWT signature server-side. It trusts whatever is in the cookie. `getUser()` makes a network call to verify the session with Supabase Auth.

**How to avoid:** In Next.js middleware and server components, always use `getUser()`. Use `getSession()` only in client components where performance matters more.

**Warning signs:** Protected routes accessible after token expiry; users see each other's data in edge cases.

### Pitfall 5: Account Trigger Not in `public` Schema

**What goes wrong:** The trigger on `auth.users` fails because the function references `public.accounts` but Supabase's auth schema is separate.

**Why it happens:** Supabase manages `auth.users` in a protected schema. Triggers on it must use `SECURITY DEFINER` to have permission to write to `public.accounts`.

**How to avoid:** Always use `SECURITY DEFINER` on the trigger function. Verify the trigger in the Supabase Dashboard > Database > Triggers.

**Warning signs:** Registration succeeds but no account row appears; subsequent API calls return "Conta nao encontrada".

### Pitfall 6: Missing `enableRLS()` in Drizzle Schema

**What goes wrong:** Drizzle generates `CREATE POLICY` statements but not `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. The policies exist but are inactive.

**Why it happens:** Drizzle's `pgPolicy` generates the policy definitions. But RLS must be separately enabled on the table. As of drizzle-orm 0.33.x, you may need to add a raw SQL migration or check if `.enableRLS()` is supported on the table object.

**How to avoid:** After generating migrations, review the generated SQL. Add `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;` if it's missing.

**Warning signs:** RLS policies visible in Supabase Dashboard but data is not filtered; any authenticated user can read all rows.

---

## Code Examples

### Generating an Encryption Key

```bash
# Run once, store result in .env as ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Fastify Server with Auth Middleware and Routes

```typescript
// apps/engine/src/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import botRoutes from "./routes/bots.js";
import accountRoutes from "./routes/account.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.APP_URL || "http://localhost:3000",
});

// Health check (unauthenticated — for Railway health checks)
app.get("/health", async () => ({
  status: "ok",
  timestamp: new Date().toISOString(),
}));

// WhatsApp webhook (unauthenticated — Meta sends no JWT)
app.get("/webhooks/whatsapp", /* ... existing handler ... */);
app.post("/webhooks/whatsapp", /* ... existing handler ... */);

// Authenticated API routes
await app.register(botRoutes, { prefix: "/api/v1/bots" });
await app.register(accountRoutes, { prefix: "/api/v1/account" });

await app.listen({
  port: parseInt(process.env.PORT || process.env.ENGINE_PORT || "4000", 10),
  host: "::",  // Required for Railway — binds to all interfaces including IPv6
});
```

**Note:** Use `PORT` (not `ENGINE_PORT`) in production — Railway injects `PORT` automatically. The local fallback can use `ENGINE_PORT`.

### Verifying the Encryption Utility Works

```typescript
// Quick smoke test — can be run with: pnpm --filter @zapbot/db exec tsx src/test-crypto.ts
import { encrypt, decrypt } from "./crypto.js";

const original = "my-whatsapp-access-token-12345";
const encrypted = encrypt(original);
const decrypted = decrypt(encrypted);

console.assert(decrypted === original, "Encryption round-trip failed");
console.log("Encryption test passed");
console.log("Encrypted length:", encrypted.length); // Should be >original.length
```

### Supabase Google OAuth Configuration

In the frontend login page:
```typescript
// apps/web/src/app/login/page.tsx
"use client";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const loginWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Scopes needed for Calendar (Phase 3+) — request now to avoid re-consent
        scopes: "openid email profile",
      },
    });
  };

  // ... render login form
}
```

Auth callback route:
```typescript
// apps/web/src/app/auth/callback/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @fastify/jwt with static HS256 secret | jose + JWKS endpoint for ES256 | October 2025 (Supabase default change) | Must use JWKS approach for new Supabase projects |
| @supabase/auth-helpers-nextjs | @supabase/ssr | ~2024 | auth-helpers is deprecated; ssr package is the current standard |
| SQL migration files for RLS | Drizzle pgPolicy in schema | drizzle-orm 0.30+ | Policies now co-located with table definitions, version-controlled |
| supabase.auth.getSession() server-side | supabase.auth.getUser() server-side | ~2024 | getSession() doesn't validate JWT server-side — security fix |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`. Do not use.
- Static JWT secret approach with @fastify/jwt: Still works for legacy projects but not for new projects created after October 2025.

---

## Open Questions

1. **Which JWT algorithm does the Supabase project use?**
   - What we know: New projects default to ES256 (asymmetric) since October 2025.
   - What's unclear: This specific project hasn't been created yet. When it is, the developer must check Authentication > Settings > JWT in the Supabase Dashboard.
   - Recommendation: Default to the `jose` + JWKS approach — it works for both HS256 and ES256. Do not hardcode the algorithm.

2. **Should drizzle migrations go to `./drizzle` or `./supabase/migrations`?**
   - What we know: If using Supabase's migration system (`supabase db push`), output to `./supabase/migrations`. If using Drizzle's own runner (`drizzle-kit migrate`), `./drizzle` is standard.
   - What's unclear: The project doesn't have a Supabase CLI setup yet.
   - Recommendation: Use `./drizzle` as the output directory and `drizzle-kit migrate` as the runner. Simpler, fewer dependencies, works directly with `DATABASE_URL` from Supabase.

3. **Does drizzle-orm 0.33.0 support `.enableRLS()` on tables?**
   - What we know: The `pgPolicy` function is documented and supported. `.enableRLS()` may have been added in a later version.
   - What's unclear: Whether the current version (0.33.0) requires a raw SQL migration for the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statement.
   - Recommendation: Check generated migration output after adding pgPolicy. If `ENABLE ROW LEVEL SECURITY` is missing, add it manually in the migration file.

---

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM RLS Documentation](https://orm.drizzle.team/docs/rls) — pgPolicy syntax, authenticatedRole, Supabase integration
- [drizzle-supabase-rls Reference Implementation](https://github.com/rphlmr/drizzle-supabase-rls) — dual client pattern, RLS transaction context
- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts) — JWKS endpoint format, jose library recommendation
- [Supabase SSR for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — @supabase/ssr setup, getUser() requirement
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html) — AES-256-GCM implementation
- [Drizzle Config File Documentation](https://orm.drizzle.team/docs/drizzle-config-file) — drizzle.config.ts format, entities.roles.provider

### Secondary (MEDIUM confidence)
- [Migrating from Static JWT Secrets to JWKS in Supabase](https://objectgraph.com/blog/migrating-supabase-jwt-jwks/) — Timeline and migration approach confirmed
- [@psteinroe/fastify-supabase](https://github.com/psteinroe/fastify-supabase) — Available as alternative to manual jose setup
- [fastify-jwt-jwks](https://github.com/nearform/fastify-jwt-jwks) — Fastify-specific JWKS verification plugin
- [Drizzle with Supabase Database](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase) — Connection setup examples

### Tertiary (LOW confidence)
- [Supabase Asymmetric Keys Discussion](https://github.com/orgs/supabase/discussions/29289) — Community discussion about timeline

---

## Metadata

**Confidence breakdown:**
- drizzle.config.ts pattern: HIGH — verified with official Drizzle docs
- Dual DB client pattern: HIGH — verified with official reference implementation
- RLS policy syntax (pgPolicy): HIGH — verified with official Drizzle docs; caveat on `.enableRLS()` availability in 0.33.0
- Auth middleware (jose + JWKS): HIGH — verified with official Supabase JWT docs
- JWT algorithm migration: HIGH — confirmed October 2025 timeline
- AES-256-GCM encryption: HIGH — standard Node.js crypto, multiple verified sources
- Next.js @supabase/ssr setup: HIGH — verified with official Supabase docs
- Account trigger pattern: MEDIUM — pattern is standard, exact SQL syntax needs verification against Supabase version

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (30 days — drizzle and supabase APIs are moderately stable)

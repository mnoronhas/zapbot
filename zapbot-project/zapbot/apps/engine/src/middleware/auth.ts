import { jwtVerify, createRemoteJWKSet } from "jose";
import type { onRequestHookHandler } from "fastify";
import { adminDb } from "@zapbot/db";
import { accounts } from "@zapbot/db";
import { eq } from "drizzle-orm";
import { LRUCache } from "lru-cache";

// ---------------------------------------------------------------------------
// JWKS Setup — Supabase exposes JWKS for JWT verification
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is required for JWT verification");
}

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// ---------------------------------------------------------------------------
// Account cache — prevents N+1 DB queries per request
// 5 minute TTL, max 1000 entries (covers large concurrent user base)
// ---------------------------------------------------------------------------

export const accountCache = new LRUCache<string, typeof accounts.$inferSelect>({
  max: 1000,
  ttl: 5 * 60 * 1000,
});

/**
 * Clears the cached account for a given Supabase user ID.
 * Call this after updating account data to ensure fresh data on next request.
 */
export function clearAccountCache(supabaseUserId: string): void {
  accountCache.delete(supabaseUserId);
}

// ---------------------------------------------------------------------------
// Fastify type augmentation — decorate request with auth data
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    jwtClaims: Record<string, unknown>;
    account: typeof accounts.$inferSelect;
  }
}

// ---------------------------------------------------------------------------
// requireAuth — onRequest hook for protected routes
// ---------------------------------------------------------------------------

export const requireAuth: onRequestHookHandler = async (request, reply) => {
  // 1. Extract Bearer token
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: "Token de autenticacao ausente",
      code: "MISSING_TOKEN",
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    // 2. Verify JWT using Supabase JWKS (works for both HS256 and ES256)
    const { payload } = await jwtVerify(token, JWKS, {
      audience: "authenticated",
    });

    // 3. Attach claims to request for downstream use
    request.jwtClaims = payload as Record<string, unknown>;

    // 4. Resolve account from payload.sub (Supabase user ID)
    const supabaseUserId = payload.sub;
    if (!supabaseUserId) {
      return reply.status(401).send({
        error: "Token invalido ou expirado",
        code: "INVALID_TOKEN",
      });
    }

    // Check LRU cache first to avoid DB hit on every request
    const cached = accountCache.get(supabaseUserId);
    if (cached) {
      request.account = cached;
      return;
    }

    // Cache miss — query DB
    const rows = await adminDb
      .select()
      .from(accounts)
      .where(eq(accounts.supabaseUserId, supabaseUserId));

    if (rows.length === 0) {
      return reply.status(403).send({
        error: "Conta nao encontrada",
        code: "NO_ACCOUNT",
      });
    }

    const account = rows[0];
    accountCache.set(supabaseUserId, account);

    // 5. Attach account to request
    request.account = account;
  } catch (err) {
    request.log.warn({ err }, "JWT verification failed");
    return reply.status(401).send({
      error: "Token invalido ou expirado",
      code: "INVALID_TOKEN",
    });
  }
};

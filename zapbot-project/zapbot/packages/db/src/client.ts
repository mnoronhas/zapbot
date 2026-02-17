import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";

// CRITICAL: prepare: false is REQUIRED for Supabase connection pooler (Transaction mode).
// Without it, "prepared statement already exists" errors occur in production.
const adminConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
export const adminDb = drizzle(adminConnection, { schema });

// RLS client — for user-scoped queries (RLS enforced within transactions)
const rlsConnection = postgres(process.env.DATABASE_URL!, { prepare: false });
const rlsDb = drizzle(rlsConnection, { schema });

export type JwtClaims = {
  sub: string;
  role: string;
  email?: string;
  [key: string]: unknown;
};

/**
 * Creates an authenticated database context that enforces Row-Level Security.
 *
 * Returns:
 * - `admin`: adminDb for non-RLS queries (e.g., webhook processing, triggers)
 * - `rls`: wraps rlsDb.transaction() and sets JWT context via set_config()
 *   so Supabase RLS policies can evaluate auth.uid() and request.jwt.claims
 */
export function createAuthenticatedDb(claims: JwtClaims) {
  return {
    admin: adminDb,
    rls: (async (transaction, ...rest) => {
      return await rlsDb.transaction(async (tx) => {
        try {
          await tx.execute(sql`
            SELECT set_config('request.jwt.claims', ${sql.raw(
              "'" + JSON.stringify(claims).replace(/'/g, "''") + "'"
            )}, TRUE);
            SELECT set_config('request.jwt.claim.sub', ${sql.raw(
              "'" + (claims.sub ?? "").replace(/'/g, "''") + "'"
            )}, TRUE);
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

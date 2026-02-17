import type { FastifyPluginAsync } from "fastify";
import { requireAuth, clearAccountCache } from "../middleware/auth.js";
import { adminDb } from "@zapbot/db";
import { accounts } from "@zapbot/db";
import { eq } from "drizzle-orm";

const accountRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // GET / → GET /api/v1/account
  // Returns the authenticated user's account data
  // -------------------------------------------------------------------------
  app.get("/", { onRequest: [requireAuth] }, async (request) => {
    return { data: request.account };
  });

  // -------------------------------------------------------------------------
  // PATCH / → PATCH /api/v1/account
  // Updates mutable account fields (businessName, timezone)
  // -------------------------------------------------------------------------
  app.patch("/", { onRequest: [requireAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // Only update fields that exist on the accounts table
    if (typeof body.businessName === "string" && body.businessName.trim()) {
      updateData.businessName = body.businessName.trim();
    }

    if (typeof body.businessPhone === "string" && body.businessPhone.trim()) {
      updateData.businessPhone = body.businessPhone.trim();
    }

    if (typeof body.businessType === "string" && body.businessType.trim()) {
      updateData.businessType = body.businessType.trim();
    }

    const rows = await adminDb
      .update(accounts)
      .set(updateData)
      .where(eq(accounts.id, request.account.id))
      .returning();

    if (rows.length === 0) {
      return reply.status(404).send({
        error: "Conta nao encontrada",
        code: "NO_ACCOUNT",
      });
    }

    // Invalidate LRU cache so next request gets fresh data
    const supabaseUserId = request.jwtClaims.sub as string;
    clearAccountCache(supabaseUserId);

    return { data: rows[0] };
  });
};

export default accountRoutes;

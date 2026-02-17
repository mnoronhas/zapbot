import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { adminDb } from "@zapbot/db";
import { bots } from "@zapbot/db";
import { eq } from "drizzle-orm";

/** Empty flow template for newly created bots */
const emptyFlow = {
  version: 1,
  startNodeId: "start",
  nodes: [],
};

const botRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // GET / → GET /api/v1/bots
  // Returns all bots belonging to the authenticated user's account
  // -------------------------------------------------------------------------
  app.get("/", { onRequest: [requireAuth] }, async (request) => {
    const results = await adminDb
      .select()
      .from(bots)
      .where(eq(bots.accountId, request.account.id));

    return { data: results };
  });

  // -------------------------------------------------------------------------
  // POST / → POST /api/v1/bots
  // Creates a new bot with an empty flow for the authenticated user's account
  // -------------------------------------------------------------------------
  app.post("/", { onRequest: [requireAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : "Meu Bot";

    const [newBot] = await adminDb
      .insert(bots)
      .values({
        accountId: request.account.id,
        name,
        flowJson: emptyFlow,
      })
      .returning();

    return reply.status(201).send({ data: newBot });
  });
};

export default botRoutes;

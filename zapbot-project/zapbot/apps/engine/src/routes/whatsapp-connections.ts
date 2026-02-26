/**
 * WhatsApp Connections Routes — Evolution API instance lifecycle.
 *
 * POST /   — Create instance + return QR code
 * GET /    — Get connection(s) for account
 * GET /status — Poll connection status
 * DELETE /:id — Disconnect and delete instance
 */

import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { EvolutionClient } from "@zapbot/whatsapp";
import { adminDb, encrypt, whatsappConnections } from "@zapbot/db";
import { eq, and } from "drizzle-orm";

function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("EVOLUTION_API_URL and EVOLUTION_API_KEY must be configured");
  }
  return { baseUrl, apiKey };
}

function buildInstanceName(accountId: string): string {
  return `zapbot_${accountId.slice(0, 8)}`;
}

const waConnectionRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // POST / — Create Evolution instance + get QR code
  // -------------------------------------------------------------------------
  app.post("/", { onRequest: [requireAuth] }, async (request, reply) => {
    const accountId = request.account.id;
    const instanceName = buildInstanceName(accountId);
    const { baseUrl, apiKey } = getEvolutionConfig();
    const engineUrl = process.env.ENGINE_URL || "http://localhost:4000";
    const webhookUrl = `${engineUrl}/webhooks/evolution`;

    const client = new EvolutionClient({ baseUrl, apiKey, instanceName });

    try {
      // Check if instance already exists
      const [existing] = await adminDb
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.accountId, accountId))
        .limit(1);

      if (existing && existing.status === "connected") {
        return reply.status(409).send({
          error: "WhatsApp ja esta conectado",
          code: "ALREADY_CONNECTED",
        });
      }

      // Delete existing instance if in pending/disconnected state to start fresh
      if (existing) {
        try {
          await client.deleteInstance();
        } catch {
          // Instance may not exist on Evolution side — that's fine
        }
        await adminDb
          .delete(whatsappConnections)
          .where(eq(whatsappConnections.id, existing.id));
      }

      // Create new instance
      await client.createInstance(instanceName, webhookUrl);

      // Get QR code
      const connectResult = await client.connectInstance();

      // Save connection record
      const [connection] = await adminDb
        .insert(whatsappConnections)
        .values({
          accountId,
          phoneNumberId: instanceName,
          wabaId: "evolution-api",
          accessTokenEncrypted: encrypt(apiKey),
          webhookVerifyToken: crypto.randomUUID(),
          status: "pending",
        })
        .returning();

      return {
        data: {
          connectionId: connection.id,
          instanceName,
          qrCode: connectResult.base64 || null,
          pairingCode: connectResult.pairingCode || null,
          status: "pending",
        },
      };
    } catch (err) {
      request.log.error({ err, instanceName }, "Failed to create Evolution instance");
      return reply.status(500).send({
        error: "Erro ao criar conexao WhatsApp",
        code: "INSTANCE_CREATE_FAILED",
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET / — Get connection(s) for the authenticated account
  // -------------------------------------------------------------------------
  app.get("/", { onRequest: [requireAuth] }, async (request) => {
    const accountId = request.account.id;

    const [connection] = await adminDb
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.accountId, accountId))
      .limit(1);

    if (!connection) {
      return { data: null };
    }

    const result: Record<string, unknown> = {
      id: connection.id,
      instanceName: connection.phoneNumberId,
      displayPhoneNumber: connection.displayPhoneNumber,
      status: connection.status,
      createdAt: connection.createdAt,
    };

    // If pending, return a fresh QR code
    if (connection.status === "pending") {
      try {
        const { baseUrl, apiKey } = getEvolutionConfig();
        const client = new EvolutionClient({
          baseUrl,
          apiKey,
          instanceName: connection.phoneNumberId,
        });
        const connectResult = await client.connectInstance();
        result.qrCode = connectResult.base64 || null;
        result.pairingCode = connectResult.pairingCode || null;
      } catch {
        result.qrCode = null;
        result.pairingCode = null;
      }
    }

    return { data: result };
  });

  // -------------------------------------------------------------------------
  // GET /status — Poll connection status from Evolution API
  // -------------------------------------------------------------------------
  app.get("/status", { onRequest: [requireAuth] }, async (request) => {
    const accountId = request.account.id;

    const [connection] = await adminDb
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.accountId, accountId))
      .limit(1);

    if (!connection) {
      return { data: { status: "none" } };
    }

    // If already connected, just return status from DB
    if (connection.status === "connected") {
      return {
        data: {
          status: "connected",
          displayPhoneNumber: connection.displayPhoneNumber,
        },
      };
    }

    // Check live status on Evolution API
    try {
      const { baseUrl, apiKey } = getEvolutionConfig();
      const client = new EvolutionClient({
        baseUrl,
        apiKey,
        instanceName: connection.phoneNumberId,
      });

      const info = await client.fetchInstance();
      const instanceStatus = info?.instance?.status;

      if (instanceStatus === "open") {
        // Update DB to connected + store owner phone
        const ownerPhone = info?.instance?.owner?.replace(/@s\.whatsapp\.net$/, "") || null;
        await adminDb
          .update(whatsappConnections)
          .set({
            status: "connected",
            displayPhoneNumber: ownerPhone,
            updatedAt: new Date(),
          })
          .where(eq(whatsappConnections.id, connection.id));

        return {
          data: {
            status: "connected",
            displayPhoneNumber: ownerPhone,
          },
        };
      }

      return { data: { status: connection.status } };
    } catch (err) {
      request.log.error({ err }, "Failed to fetch instance status");
      return { data: { status: connection.status } };
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /:id — Disconnect and delete instance
  // -------------------------------------------------------------------------
  app.delete("/:id", { onRequest: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const accountId = request.account.id;

    const [connection] = await adminDb
      .select()
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.id, id),
          eq(whatsappConnections.accountId, accountId),
        ),
      )
      .limit(1);

    if (!connection) {
      return reply.status(404).send({
        error: "Conexao nao encontrada",
        code: "NOT_FOUND",
      });
    }

    // Delete instance on Evolution API
    try {
      const { baseUrl, apiKey } = getEvolutionConfig();
      const client = new EvolutionClient({
        baseUrl,
        apiKey,
        instanceName: connection.phoneNumberId,
      });
      await client.deleteInstance();
    } catch (err) {
      request.log.warn({ err }, "Failed to delete Evolution instance (may already be gone)");
    }

    // Update DB status
    await adminDb
      .update(whatsappConnections)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(eq(whatsappConnections.id, connection.id));

    return { data: { status: "disconnected" } };
  });
};

export default waConnectionRoutes;

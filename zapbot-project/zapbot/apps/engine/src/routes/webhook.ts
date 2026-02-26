/**
 * Evolution API Webhook Routes — Fastify plugin.
 *
 * Handles incoming messages (MESSAGES_UPSERT) and connection updates
 * (CONNECTION_UPDATE) from Evolution API.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  EvolutionClient,
  type EvolutionWebhookPayload,
  type EvolutionConnectionData,
} from "@zapbot/whatsapp";
import { adminDb, whatsappConnections } from "@zapbot/db";
import { eq } from "drizzle-orm";
import { handleIncomingMessage } from "../services/message-handler.js";

const webhookRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // POST / — Incoming events from Evolution API
  // -------------------------------------------------------------------------
  app.post("/", async (request, reply) => {
    // Always return 200 immediately to prevent retries
    reply.status(200).send("EVENT_RECEIVED");

    const body = request.body as EvolutionWebhookPayload;
    const event = body.event;
    const instanceName = body.instance;

    if (!event || !instanceName) return;

    // -----------------------------------------------------------------------
    // MESSAGES_UPSERT — Incoming user message
    // -----------------------------------------------------------------------
    if (event === "messages.upsert") {
      const data = body.data;

      // Skip messages sent by us
      if (data.key?.fromMe) return;

      const parsed = EvolutionClient.parseIncomingMessage(data);
      if (!parsed) return;

      handleIncomingMessage({
        parsed,
        instanceName,
        contactName: data.pushName,
        logger: app.log,
      }).catch((err) => {
        app.log.error(
          { err, messageId: parsed.messageId, from: parsed.from },
          "Unhandled error processing message",
        );
      });
    }

    // -----------------------------------------------------------------------
    // CONNECTION_UPDATE — Instance connection state changed
    // -----------------------------------------------------------------------
    if (event === "connection.update") {
      const connectionData = body.data as unknown as EvolutionConnectionData;
      const state = connectionData.state;

      if (!state) return;

      app.log.info({ instanceName, state }, "Evolution connection update");

      if (state === "open") {
        // Mark as connected in DB
        await adminDb
          .update(whatsappConnections)
          .set({ status: "connected", updatedAt: new Date() })
          .where(eq(whatsappConnections.phoneNumberId, instanceName))
          .catch((err) => {
            app.log.error({ err, instanceName }, "Failed to update connection status to connected");
          });
      } else if (state === "close") {
        await adminDb
          .update(whatsappConnections)
          .set({ status: "disconnected", updatedAt: new Date() })
          .where(eq(whatsappConnections.phoneNumberId, instanceName))
          .catch((err) => {
            app.log.error({ err, instanceName }, "Failed to update connection status to disconnected");
          });
      }
    }
  });
};

export default webhookRoutes;

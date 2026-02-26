/**
 * WhatsApp Webhook Routes — Fastify plugin.
 *
 * Handles Meta webhook verification (GET) and incoming messages (POST).
 * Uses a custom content-type parser to capture the raw body for HMAC
 * signature verification while still parsing JSON for route handlers.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  WhatsAppClient,
  type WebhookEntry,
  type IncomingMessage,
} from "@zapbot/whatsapp";
import { handleIncomingMessage } from "../services/message-handler.js";

const webhookRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // Raw body parser — capture raw bytes for HMAC, then parse JSON.
  // Scoped to this plugin only (Fastify encapsulation).
  // -------------------------------------------------------------------------
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      // Store raw body for signature verification
      (_req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        const parsed = JSON.parse((body as Buffer).toString("utf-8"));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET / — Meta webhook verification challenge
  // -------------------------------------------------------------------------
  app.get("/", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      app.log.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured");
      return reply.status(500).send("Server misconfiguration");
    }

    const result = WhatsAppClient.handleVerifyChallenge(
      query["hub.mode"],
      query["hub.verify_token"],
      query["hub.challenge"],
      verifyToken,
    );

    return reply.status(result.status).send(result.body);
  });

  // -------------------------------------------------------------------------
  // POST / — Incoming messages from Meta
  // -------------------------------------------------------------------------
  app.post("/", async (request, reply) => {
    // Always return 200 immediately to prevent Meta retries
    reply.status(200).send("EVENT_RECEIVED");

    const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
    const signature = request.headers["x-hub-signature-256"] as string | undefined;

    // Verify webhook signature if app secret is configured
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret && rawBody && signature) {
      const verifier = new WhatsAppClient({
        phoneNumberId: "",
        accessToken: "",
        appSecret,
      });

      if (!verifier.verifyWebhookSignature(rawBody, signature)) {
        app.log.warn("Invalid webhook signature — dropping payload");
        return;
      }
    }

    // Extract and process messages from the webhook payload
    const body = request.body as { object?: string; entry?: WebhookEntry[] };

    if (body.object !== "whatsapp_business_account" || !body.entry) {
      return;
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages) continue;

        const phoneNumberId = value.metadata.phone_number_id;
        const contactName = value.contacts?.[0]?.profile?.name;

        for (const rawMessage of value.messages) {
          const parsed = WhatsAppClient.parseIncomingMessage(rawMessage as IncomingMessage);
          if (!parsed) continue;

          // Fire-and-forget — each message processed independently
          handleIncomingMessage({
            parsed,
            phoneNumberId,
            contactName,
            logger: app.log,
          }).catch((err) => {
            app.log.error(
              { err, messageId: parsed.messageId, from: parsed.from },
              "Unhandled error processing message",
            );
          });
        }
      }
    }
  });
};

export default webhookRoutes;

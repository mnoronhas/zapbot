import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.APP_URL || "http://localhost:3000",
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// WhatsApp Webhook — Verification (GET)
// ---------------------------------------------------------------------------
app.get("/webhooks/whatsapp", async (request, reply) => {
  const query = request.query as Record<string, string>;
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    app.log.error("WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured");
    return reply.status(500).send("Server misconfiguration");
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    app.log.info("WhatsApp webhook verified");
    return reply.status(200).send(challenge);
  }

  return reply.status(403).send("Forbidden");
});

// ---------------------------------------------------------------------------
// WhatsApp Webhook — Incoming Messages (POST)
// ---------------------------------------------------------------------------
app.post("/webhooks/whatsapp", async (request, reply) => {
  // Always return 200 immediately to prevent Meta retries
  // Process the message asynchronously
  reply.status(200).send("EVENT_RECEIVED");

  try {
    const body = request.body as Record<string, unknown>;
    // TODO: Verify webhook signature
    // TODO: Parse incoming message
    // TODO: Route to flow engine
    // TODO: Send response
    app.log.info({ body }, "Received WhatsApp webhook");
  } catch (error) {
    app.log.error(error, "Error processing WhatsApp webhook");
  }
});

// ---------------------------------------------------------------------------
// API Routes (for the frontend)
// ---------------------------------------------------------------------------

// TODO: Mount API routes
// app.register(botRoutes, { prefix: "/api/v1/bots" });
// app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
// app.register(appointmentRoutes, { prefix: "/api/v1/appointments" });
// app.register(analyticsRoutes, { prefix: "/api/v1/analytics" });

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.ENGINE_PORT || "4000", 10);

try {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`ZapBot engine running on port ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

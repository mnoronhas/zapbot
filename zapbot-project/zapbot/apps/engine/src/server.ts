import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import accountRoutes from "./routes/account.js";
import botRoutes from "./routes/bots.js";
import webhookRoutes from "./routes/webhook.js";
import waConnectionRoutes from "./routes/whatsapp-connections.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.APP_URL || "http://localhost:3000",
});

// ---------------------------------------------------------------------------
// Health check — unauthenticated
// ---------------------------------------------------------------------------
app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Evolution API Webhook — unauthenticated (processes incoming messages)
// ---------------------------------------------------------------------------
await app.register(webhookRoutes, { prefix: "/webhooks/evolution" });

// ---------------------------------------------------------------------------
// API Routes — authenticated via requireAuth middleware in each route plugin
// ---------------------------------------------------------------------------
await app.register(accountRoutes, { prefix: "/api/v1/account" });
await app.register(botRoutes, { prefix: "/api/v1/bots" });
await app.register(waConnectionRoutes, { prefix: "/api/v1/whatsapp-connections" });

// ---------------------------------------------------------------------------
// Start
// PORT is used on Railway; ENGINE_PORT for local dev
// host "::" binds to all interfaces (IPv4 + IPv6), required for Railway
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || process.env.ENGINE_PORT || "4000", 10);

try {
  await app.listen({ port, host: "::" });
  app.log.info(`ZapBot engine running on port ${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

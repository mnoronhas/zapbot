/**
 * Message Handler — Orchestrates incoming WhatsApp message processing.
 *
 * Pipeline: dedup → tenant lookup → find bot → find/create conversation
 *   → save inbound → run engine → send responses → update state
 */

import type { FastifyBaseLogger } from "fastify";
import type { ParsedMessage } from "@zapbot/whatsapp";
import type { BotFlow } from "@zapbot/flow-schema";
import { WhatsAppClient } from "@zapbot/whatsapp";
import {
  adminDb,
  decrypt,
  whatsappConnections,
  bots,
  conversations,
  messages,
} from "@zapbot/db";
import { eq, and } from "drizzle-orm";
import { FlowEngine } from "./flow-engine.js";
import type { ConversationState, OutgoingMessage } from "./flow-engine.js";

export type MessageHandlerInput = {
  parsed: ParsedMessage;
  phoneNumberId: string;
  contactName: string | undefined;
  logger: FastifyBaseLogger;
};

export async function handleIncomingMessage(input: MessageHandlerInput): Promise<void> {
  const { parsed, phoneNumberId, contactName, logger } = input;

  // 1. Dedup — skip if we already processed this WhatsApp message ID
  const [existing] = await adminDb
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.waMessageId, parsed.messageId))
    .limit(1);

  if (existing) {
    logger.debug({ waMessageId: parsed.messageId }, "Duplicate message, skipping");
    return;
  }

  // 2. Tenant lookup — find account by phone number ID
  const [connection] = await adminDb
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.phoneNumberId, phoneNumberId),
        eq(whatsappConnections.status, "connected"),
      ),
    )
    .limit(1);

  if (!connection) {
    logger.warn({ phoneNumberId }, "No connected WhatsApp account for phone number ID");
    return;
  }

  const accountId = connection.accountId;

  // 3. Find published bot (LIMIT 1 for MVP — one bot per account)
  const [bot] = await adminDb
    .select()
    .from(bots)
    .where(and(eq(bots.accountId, accountId), eq(bots.status, "published")))
    .limit(1);

  if (!bot) {
    logger.warn({ accountId }, "No published bot for account");
    return;
  }

  // 4. Find or create active conversation
  let [conversation] = await adminDb
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.botId, bot.id),
        eq(conversations.contactPhone, parsed.from),
        eq(conversations.status, "active"),
      ),
    )
    .limit(1);

  if (!conversation) {
    const [created] = await adminDb
      .insert(conversations)
      .values({
        accountId,
        botId: bot.id,
        contactPhone: parsed.from,
        contactName: contactName || null,
        currentNodeId: null,
        variables: {},
        status: "active",
      })
      .returning();
    conversation = created;
    logger.info({ conversationId: conversation.id, from: parsed.from }, "New conversation created");
  }

  // 5. Save inbound message
  await adminDb.insert(messages).values({
    conversationId: conversation.id,
    direction: "inbound",
    content: parsed.text,
    messageType: parsed.type,
    waMessageId: parsed.messageId,
    nodeId: conversation.currentNodeId,
  });

  // 6. Run flow engine
  const flowJson = bot.flowJson as BotFlow;
  const engine = new FlowEngine(flowJson);

  const state: ConversationState = {
    conversationId: conversation.id,
    currentNodeId: conversation.currentNodeId,
    variables: (conversation.variables as Record<string, string>) || {},
    status: conversation.status as "active" | "completed" | "handed_off",
  };

  const engineOutput = engine.process(parsed, state);

  // 7. Send responses — decrypt token, create client, dispatch each message
  const accessToken = decrypt(connection.accessTokenEncrypted);
  const client = new WhatsAppClient({
    phoneNumberId: connection.phoneNumberId,
    accessToken,
  });

  for (const msg of engineOutput.messages) {
    try {
      const result = await sendOutgoingMessage(client, parsed.from, msg);
      const waMessageId = result?.messages?.[0]?.id;

      await adminDb.insert(messages).values({
        conversationId: conversation.id,
        direction: "outbound",
        content: getMessageContent(msg),
        messageType: msg.type,
        waMessageId: waMessageId || null,
        nodeId: engineOutput.state.currentNodeId,
      });
    } catch (err) {
      logger.error({ err, messageType: msg.type }, "Failed to send outbound message");
    }
  }

  // 8. Update conversation state
  await adminDb
    .update(conversations)
    .set({
      currentNodeId: engineOutput.state.currentNodeId,
      variables: engineOutput.state.variables,
      status: engineOutput.state.status,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversation.id));

  // 9. Mark as read (fire-and-forget)
  client.markAsRead(parsed.messageId).catch((err) => {
    logger.debug({ err }, "Failed to mark message as read (non-critical)");
  });

  // 10. Log side effects for future implementation
  if (engineOutput.sideEffects.length > 0) {
    logger.info(
      { sideEffects: engineOutput.sideEffects, conversationId: conversation.id },
      "Side effects produced (not yet implemented)",
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendOutgoingMessage(
  client: WhatsAppClient,
  to: string,
  msg: OutgoingMessage,
) {
  switch (msg.type) {
    case "text":
      return client.sendText(to, msg.body);
    case "buttons":
      return client.sendButtons(to, msg.body, msg.buttons);
    case "list":
      return client.sendList(to, msg.body, msg.buttonText, msg.sections);
    case "template":
      return client.sendTemplate(to, msg.templateName, msg.languageCode, msg.components);
  }
}

function getMessageContent(msg: OutgoingMessage): string {
  switch (msg.type) {
    case "text":
      return msg.body;
    case "buttons":
      return msg.body;
    case "list":
      return msg.body;
    case "template":
      return `[template: ${msg.templateName}]`;
  }
}

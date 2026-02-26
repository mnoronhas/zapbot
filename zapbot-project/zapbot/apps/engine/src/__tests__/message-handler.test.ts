import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedMessage } from "@zapbot/whatsapp";

// ---------------------------------------------------------------------------
// Mock @zapbot/db
// ---------------------------------------------------------------------------
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

// Chain builders for select
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
mockSelect.mockReturnValue(selectChain);

// Chain builders for insert
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
};
mockInsert.mockReturnValue(insertChain);

// Chain builders for update
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
mockUpdate.mockReturnValue(updateChain);

vi.mock("@zapbot/db", () => ({
  adminDb: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  whatsappConnections: { phoneNumberId: "phone_number_id", status: "status" },
  bots: { accountId: "account_id", status: "status" },
  conversations: { botId: "bot_id", contactPhone: "contact_phone", status: "status", id: "id" },
  messages: { id: "id", waMessageId: "wa_message_id" },
}));

// ---------------------------------------------------------------------------
// Mock @zapbot/whatsapp — EvolutionClient
// ---------------------------------------------------------------------------
const mockSendText = vi.fn().mockResolvedValue({ key: { id: "evo.out1" } });
const mockSendButtons = vi.fn().mockResolvedValue({ key: { id: "evo.out2" } });
const mockSendList = vi.fn().mockResolvedValue({ key: { id: "evo.out3" } });
const mockSendTemplate = vi.fn().mockResolvedValue(null);
const mockMarkAsRead = vi.fn().mockResolvedValue(undefined);

vi.mock("@zapbot/whatsapp", () => ({
  EvolutionClient: vi.fn().mockImplementation(() => ({
    sendText: mockSendText,
    sendButtons: mockSendButtons,
    sendList: mockSendList,
    sendTemplate: mockSendTemplate,
    markAsRead: mockMarkAsRead,
  })),
}));

// ---------------------------------------------------------------------------
// Mock flow engine
// ---------------------------------------------------------------------------
const mockProcess = vi.fn();

vi.mock("../services/flow-engine.js", () => ({
  FlowEngine: vi.fn().mockImplementation(() => ({
    process: mockProcess,
  })),
}));

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators (used for where clauses)
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ op: "eq", val })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are in place
// ---------------------------------------------------------------------------
const { handleIncomingMessage } = await import("../services/message-handler.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParsedMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    type: "text",
    from: "5511999998888",
    messageId: "wamid.test123",
    text: "Ola",
    timestamp: "1700000000",
    ...overrides,
  };
}

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: "info",
  silent: vi.fn(),
} as never;

const fakeConnection = {
  id: "conn-1",
  accountId: "acct-1",
  phoneNumberId: "zapbot_acct1234",
  wabaId: "evolution-api",
  accessTokenEncrypted: "encrypted-token",
  webhookVerifyToken: "verify-token",
  displayPhoneNumber: "+5511999998888",
  status: "connected",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeBotFlow = {
  version: 1,
  startNodeId: "welcome",
  nodes: [{ id: "welcome", type: "message", content: "Ola!" }],
};

const fakeBot = {
  id: "bot-1",
  accountId: "acct-1",
  name: "Test Bot",
  flowJson: fakeBotFlow,
  status: "published",
  version: 1,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeConversation = {
  id: "conv-1",
  accountId: "acct-1",
  botId: "bot-1",
  contactPhone: "5511999998888",
  contactName: "Test User",
  currentNodeId: null,
  variables: {},
  status: "active",
  startedAt: new Date(),
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleIncomingMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no duplicate, has connection, has bot, has conversation
    selectChain.limit
      .mockResolvedValueOnce([])            // dedup: no existing message
      .mockResolvedValueOnce([fakeConnection]) // tenant lookup
      .mockResolvedValueOnce([fakeBot])        // find published bot
      .mockResolvedValueOnce([fakeConversation]); // find active conversation

    // Default engine output
    mockProcess.mockReturnValue({
      messages: [{ type: "text", body: "Ola! Bem-vindo!" }],
      state: {
        conversationId: "conv-1",
        currentNodeId: "welcome",
        variables: {},
        status: "active",
      },
      sideEffects: [],
    });

    // Insert inbound message returns void-ish
    insertChain.values.mockReturnThis();
    insertChain.returning.mockResolvedValue([]);

    // Update returns void
    updateChain.set.mockReturnThis();
    updateChain.where.mockResolvedValue(undefined);
  });

  it("skips duplicate messages", async () => {
    selectChain.limit.mockReset();
    selectChain.limit.mockResolvedValueOnce([{ id: "existing-msg-id" }]); // dedup: already exists

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Test User",
      logger: fakeLogger,
    });

    // Should NOT proceed to tenant lookup (only 1 select call for dedup)
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("returns silently when no connected WhatsApp account found", async () => {
    selectChain.limit.mockReset();
    selectChain.limit
      .mockResolvedValueOnce([])  // dedup: no existing message
      .mockResolvedValueOnce([]); // tenant lookup: no connection

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_unknown",
      contactName: undefined,
      logger: fakeLogger,
    });

    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("returns silently when no published bot found", async () => {
    selectChain.limit.mockReset();
    selectChain.limit
      .mockResolvedValueOnce([])             // dedup
      .mockResolvedValueOnce([fakeConnection]) // tenant
      .mockResolvedValueOnce([]);              // no published bot

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Test",
      logger: fakeLogger,
    });

    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("creates a new conversation when none is active", async () => {
    const newConv = { ...fakeConversation, id: "conv-new" };

    selectChain.limit.mockReset();
    selectChain.limit
      .mockResolvedValueOnce([])             // dedup
      .mockResolvedValueOnce([fakeConnection]) // tenant
      .mockResolvedValueOnce([fakeBot])        // bot
      .mockResolvedValueOnce([]);              // no active conversation

    insertChain.returning.mockResolvedValueOnce([newConv]); // create conversation

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "New User",
      logger: fakeLogger,
    });

    // insert called for: new conversation + inbound message + outbound message
    expect(mockInsert).toHaveBeenCalled();
    expect(mockProcess).toHaveBeenCalled();
  });

  it("reuses existing active conversation", async () => {
    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Test User",
      logger: fakeLogger,
    });

    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "wamid.test123" }),
      expect.objectContaining({ conversationId: "conv-1" }),
    );
  });

  it("dispatches engine output messages correctly", async () => {
    mockProcess.mockReturnValue({
      messages: [
        { type: "text", body: "Hello!" },
        {
          type: "buttons",
          body: "Choose:",
          buttons: [{ id: "a", title: "Option A" }],
        },
      ],
      state: {
        conversationId: "conv-1",
        currentNodeId: "menu",
        variables: { name: "Test" },
        status: "active",
      },
      sideEffects: [],
    });

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Test",
      logger: fakeLogger,
    });

    expect(mockSendText).toHaveBeenCalledWith("5511999998888", "Hello!");
    expect(mockSendButtons).toHaveBeenCalledWith(
      "5511999998888",
      "Choose:",
      [{ id: "a", title: "Option A" }],
    );
  });

  it("updates conversation state after processing", async () => {
    mockProcess.mockReturnValue({
      messages: [{ type: "text", body: "Done!" }],
      state: {
        conversationId: "conv-1",
        currentNodeId: "final",
        variables: { name: "Maria" },
        status: "completed",
      },
      sideEffects: [],
    });

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Maria",
      logger: fakeLogger,
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentNodeId: "final",
        variables: { name: "Maria" },
        status: "completed",
      }),
    );
  });

  it("continues sending remaining messages when one fails", async () => {
    mockProcess.mockReturnValue({
      messages: [
        { type: "text", body: "First" },
        { type: "text", body: "Second" },
        { type: "text", body: "Third" },
      ],
      state: {
        conversationId: "conv-1",
        currentNodeId: "end",
        variables: {},
        status: "active",
      },
      sideEffects: [],
    });

    mockSendText
      .mockResolvedValueOnce({ key: { id: "evo.1" } })
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({ key: { id: "evo.3" } });

    await handleIncomingMessage({
      parsed: makeParsedMessage(),
      instanceName: "zapbot_acct1234",
      contactName: "Test",
      logger: fakeLogger,
    });

    // All three attempts made even though second failed
    expect(mockSendText).toHaveBeenCalledTimes(3);
    // Conversation state still updated
    expect(updateChain.set).toHaveBeenCalled();
  });
});

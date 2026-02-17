# Testing Patterns

**Analysis Date:** 2026-02-17

## Test Framework

**Runner:**
- Vitest ^2.0.0 (declared as devDependency in multiple packages)
- No `vitest.config.ts` files exist anywhere in the codebase
- Config: None created yet — will use Vitest defaults when first tests are added

**Assertion Library:**
- Vitest built-in (`expect`, `describe`, `it`) — standard for this stack

**Run Commands:**
```bash
pnpm test                        # All packages via Turborepo
pnpm --filter @zapbot/flow-schema test   # Specific package
pnpm --filter @zapbot/engine test        # Engine package
pnpm --filter @zapbot/whatsapp test      # WhatsApp client
```

**Turbo Task Config (`zapbot-project/zapbot/turbo.json`):**
```json
"test": {
  "dependsOn": ["^build"]
}
```
Tests depend on upstream packages being built first.

## Current Test Coverage

**There are ZERO test files in the entire codebase.** No `.test.ts`, `.spec.ts`, or `__tests__/` directories exist. This is the most critical quality gap.

**Test scripts are defined** in these `package.json` files but have no test files to run:
- `zapbot-project/zapbot/apps/engine/package.json` — `"test": "vitest run"`
- `zapbot-project/zapbot/packages/flow-schema/package.json` — `"test": "vitest run"`, `"test:watch": "vitest"`
- `zapbot-project/zapbot/packages/whatsapp/package.json` — `"test": "vitest run"`
- `zapbot-project/zapbot/packages/calendar/package.json` — `"test": "vitest run"`
- `zapbot-project/zapbot/packages/db/package.json` — No test script (schema-only package)

**Coverage tool:** `.gitignore` includes `coverage/` directory, indicating coverage output is anticipated but not yet configured.

## Test File Organization

**Location (prescribed by project conventions, not yet implemented):**
- Co-located with source files or in `__tests__/` subdirectories within each package

**Naming (recommended for this project):**
- `*.test.ts` for unit tests
- `*.spec.ts` for integration tests (alternative convention)
- Match source filename: `flow-engine.test.ts` tests `flow-engine.ts`

**Recommended Structure:**
```
packages/flow-schema/
├── src/
│   ├── index.ts
│   └── __tests__/
│       └── index.test.ts        # Schema validation, analyzeFlow, createClinicTemplate
packages/whatsapp/
├── src/
│   ├── index.ts
│   └── __tests__/
│       └── client.test.ts       # WhatsAppClient methods, parseIncomingMessage
│       └── webhook.test.ts      # Signature verification, challenge handling
packages/calendar/
├── src/
│   ├── index.ts
│   └── __tests__/
│       └── availability.test.ts # calculateAvailability, generatePossibleSlots
│       └── oauth.test.ts        # Token exchange, refresh
apps/engine/
├── src/
│   ├── services/
│   │   ├── flow-engine.ts
│   │   └── __tests__/
│   │       └── flow-engine.test.ts  # FlowEngine.process, node execution, routing
│   └── __tests__/
│       └── server.test.ts       # Webhook endpoints, health check
```

## Test Structure

**Recommended Suite Organization (based on codebase patterns):**
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { FlowEngine, type ConversationState } from "../flow-engine";
import type { BotFlow } from "@zapbot/flow-schema";
import type { ParsedMessage } from "@zapbot/whatsapp";

describe("FlowEngine", () => {
  let engine: FlowEngine;
  let defaultState: ConversationState;

  beforeEach(() => {
    const flow: BotFlow = {
      version: 1,
      startNodeId: "welcome",
      nodes: [/* test nodes */],
    };
    engine = new FlowEngine(flow);
    defaultState = {
      conversationId: "test-conv-1",
      currentNodeId: null,
      variables: {},
      status: "active",
    };
  });

  describe("process", () => {
    it("starts from the beginning when currentNodeId is null", () => {
      const message: ParsedMessage = {
        type: "text",
        from: "5511999999999",
        messageId: "msg-1",
        text: "Olá",
        timestamp: "1234567890",
      };
      const output = engine.process(message, defaultState);
      expect(output.messages).toHaveLength(1);
      expect(output.state.currentNodeId).toBe("welcome");
    });
  });
});
```

## Mocking

**Framework:** Vitest built-in (`vi.fn()`, `vi.mock()`, `vi.spyOn()`)

**Recommended Mocking Patterns:**

1. **Mock external HTTP calls (fetch):**
```typescript
import { vi, describe, it, expect } from "vitest";

// Mock global fetch for WhatsApp API / Google Calendar API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("WhatsAppClient", () => {
  it("sends a text message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        messaging_product: "whatsapp",
        contacts: [{ input: "5511999999999", wa_id: "5511999999999" }],
        messages: [{ id: "wamid.abc123" }],
      }),
    });

    const client = new WhatsAppClient({
      phoneNumberId: "test-id",
      accessToken: "test-token",
    });
    const result = await client.sendText("5511999999999", "Hello");
    expect(result.messages[0].id).toBe("wamid.abc123");
  });
});
```

2. **Mock workspace packages:**
```typescript
vi.mock("@zapbot/whatsapp", () => ({
  WhatsAppClient: vi.fn().mockImplementation(() => ({
    sendText: vi.fn().mockResolvedValue({ messages: [{ id: "mock-id" }] }),
    sendButtons: vi.fn().mockResolvedValue({ messages: [{ id: "mock-id" }] }),
  })),
}));
```

**What to Mock:**
- External HTTP calls (WhatsApp Cloud API, Google Calendar API, Google OAuth)
- Database queries (Drizzle ORM operations)
- `crypto` module for webhook signature tests (use known inputs/outputs)
- Environment variables (`process.env`)

**What NOT to Mock:**
- Zod schema validation (test actual validation logic)
- `FlowEngine` internal methods (test via `process()` public API)
- `analyzeFlow` and `validateFlow` (pure functions, test directly)
- Date calculations in availability (use fixed dates, not mocked Date)

## Fixtures and Factories

**Test Data (recommended patterns based on existing code):**

```typescript
// Reusable flow fixture
export function createTestFlow(overrides?: Partial<BotFlow>): BotFlow {
  return {
    version: 1,
    startNodeId: "welcome",
    nodes: [
      { id: "welcome", type: "message", content: "Olá!", next: "menu" },
      {
        id: "menu",
        type: "buttons",
        content: "Escolha:",
        options: [
          { label: "Opção A", value: "a", next: "end" },
          { label: "Opção B", value: "b", next: "end" },
        ],
      },
      { id: "end", type: "message", content: "Tchau!" },
    ],
    ...overrides,
  };
}

// Reusable message fixture
export function createTextMessage(text: string, overrides?: Partial<ParsedMessage>): ParsedMessage {
  return {
    type: "text",
    from: "5511999999999",
    messageId: `msg-${Date.now()}`,
    text,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
}

export function createButtonReply(buttonId: string, title: string): ParsedMessage {
  return {
    type: "button_reply",
    from: "5511999999999",
    messageId: `msg-${Date.now()}`,
    text: title,
    buttonId,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}
```

**Location (recommended):**
- `packages/flow-schema/src/__tests__/fixtures.ts` — Flow fixtures
- `packages/whatsapp/src/__tests__/fixtures.ts` — Message fixtures
- `apps/engine/src/__tests__/fixtures.ts` — Conversation state fixtures

**Existing Template Factory:**
- `createClinicTemplate(businessName)` in `packages/flow-schema/src/index.ts` produces a realistic flow and can serve as test fixture

## Coverage

**Requirements:** None enforced. No coverage thresholds configured.

**Recommended Thresholds (for vitest.config.ts when created):**
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

**View Coverage (once configured):**
```bash
pnpm --filter @zapbot/flow-schema test -- --coverage
```

## Test Types

**Unit Tests (highest priority):**
- **flow-schema validation** (`packages/flow-schema/src/index.ts`):
  - `validateFlow()` with valid and invalid inputs
  - `analyzeFlow()` detecting unreachable nodes, dead ends, duplicate IDs, missing references
  - `FlowNode` Zod refinements (buttons need options, collect needs field, etc.)
  - `createClinicTemplate()` output passes validation
- **FlowEngine execution** (`apps/engine/src/services/flow-engine.ts`):
  - `process()` with new conversation (null currentNodeId)
  - `process()` advancing through message -> buttons -> collect -> appointment nodes
  - Button matching (direct reply vs text match)
  - Condition evaluation (equals, contains, exists operators)
  - Variable interpolation (`{variable}` replacement)
  - Error handling for missing nodes, invalid node references
  - Side effect generation (track_event, fetch_availability, handoff)
- **WhatsApp message parsing** (`packages/whatsapp/src/index.ts`):
  - `parseIncomingMessage()` for text, button_reply, list_reply types
  - `parseIncomingMessage()` returns null for unsupported types
  - `verifyWebhookSignature()` with valid and invalid signatures
  - `handleVerifyChallenge()` accept/reject logic
- **Availability calculation** (`packages/calendar/src/index.ts`):
  - `generatePossibleSlots()` (currently private — consider extracting for testability)
  - Slot generation respects available days and hours
  - Busy slot subtraction works correctly
  - Buffer minutes are applied

**Integration Tests (medium priority):**
- Fastify server webhook endpoints (`apps/engine/src/server.ts`):
  - `GET /webhooks/whatsapp` verification challenge
  - `POST /webhooks/whatsapp` message processing
  - `GET /health` endpoint
- WhatsApp API client (`packages/whatsapp/src/index.ts`):
  - `sendText`, `sendButtons`, `sendList`, `sendTemplate` with mocked fetch
  - Error handling for non-200 responses
- Google Calendar operations (`packages/calendar/src/index.ts`):
  - `exchangeCode`, `refreshAccessToken` with mocked fetch
  - `createEvent`, `deleteEvent`, `getBusySlots` with mocked fetch

**E2E Tests (future, not configured):**
- Playwright for web editor (mentioned in project CLAUDE.md)
- Critical paths: create flow -> test in simulator -> publish
- No Playwright dependency or config exists yet

## Priority Test Gaps

**Critical (write these first):**

1. **`packages/flow-schema` validation** — This is the shared contract between editor and engine. Zero tests on the most important data structure.
   - Files: `packages/flow-schema/src/index.ts`
   - Risk: Invalid flows could crash the engine or produce malformed WhatsApp messages
   - Priority: **High**

2. **`FlowEngine.process()` logic** — The core bot runtime with switch statements, recursive execution, and state management.
   - Files: `apps/engine/src/services/flow-engine.ts`
   - Risk: Incorrect node routing, lost conversation state, infinite recursion on auto-advancing nodes
   - Priority: **High**

3. **`WhatsAppClient.parseIncomingMessage()`** — Parses webhook payloads into internal types.
   - Files: `packages/whatsapp/src/index.ts`
   - Risk: Failing to parse messages = bot goes silent
   - Priority: **High**

**Important (write second):**

4. **Availability calculation** — Complex date/time logic with slot generation and overlap detection.
   - Files: `packages/calendar/src/index.ts`
   - Risk: Double-bookings, wrong time slots, timezone bugs
   - Priority: **Medium-High**

5. **Webhook signature verification** — Security-critical path.
   - Files: `packages/whatsapp/src/index.ts`
   - Risk: Accepting forged webhooks
   - Priority: **Medium**

**Lower priority:**

6. **Database schema** — Drizzle schema is declarative; less to test.
   - Files: `packages/db/src/schema/index.ts`
   - Risk: Low — schema is type-checked at compile time
   - Priority: **Low**

## Vitest Configuration (Recommended)

When creating test infrastructure, add `vitest.config.ts` to each testable package:

```typescript
// packages/flow-schema/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

```typescript
// apps/engine/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
```

## Common Patterns

**Async Testing (for API clients):**
```typescript
it("handles WhatsApp API errors", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: { message: "Invalid token" } }),
  });

  const client = new WhatsAppClient({ phoneNumberId: "test", accessToken: "bad" });
  await expect(client.sendText("5511999999999", "hi")).rejects.toThrow(WhatsAppApiError);
});
```

**Error Testing (for validation):**
```typescript
it("rejects flow with duplicate node IDs", () => {
  const flow: BotFlow = {
    version: 1,
    startNodeId: "a",
    nodes: [
      { id: "a", type: "message", content: "hello" },
      { id: "a", type: "message", content: "duplicate" },
    ],
  };
  const analysis = analyzeFlow(flow);
  expect(analysis.isValid).toBe(false);
  expect(analysis.issues).toContainEqual(
    expect.objectContaining({ type: "error", nodeId: "a" })
  );
});
```

**State Transition Testing (for FlowEngine):**
```typescript
it("stores collected field in conversation variables", () => {
  const flow = createTestFlow({
    nodes: [
      { id: "ask", type: "collect", content: "Nome?", field: "patient_name", fieldType: "text", next: "done" },
      { id: "done", type: "message", content: "Olá {patient_name}!" },
    ],
    startNodeId: "ask",
  });
  const engine = new FlowEngine(flow);

  // First call: engine shows the collect prompt
  const step1 = engine.process(createTextMessage("start"), {
    conversationId: "c1", currentNodeId: null, variables: {}, status: "active",
  });

  // Second call: user provides their name
  const step2 = engine.process(createTextMessage("João"), {
    ...step1.state,
  });

  expect(step2.state.variables["patient_name"]).toBe("João");
  expect(step2.messages[0].body).toBe("Olá João!");
});
```

---

*Testing analysis: 2026-02-17*

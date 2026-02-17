# Coding Conventions

**Analysis Date:** 2026-02-17

## Naming Patterns

**Files:**
- Components: `PascalCase.tsx` (e.g., `PhoneSimulator`, `BlockCard` in `ZapBot_Editor_Prototype.jsx`)
- Utilities/hooks: `camelCase.ts` (e.g., `parseFlow.ts`, `useFlowEditor.ts` — specified in project CLAUDE.md)
- Type files: `camelCase.types.ts` (e.g., `flow.types.ts` — specified, not yet created)
- API routes (Next.js): `route.ts` inside folder (App Router convention)
- Fastify routes: `kebab-case.ts` (e.g., `webhook-handler.ts` — specified convention)
- Schema files: `camelCase.ts` (e.g., `packages/db/src/schema/index.ts`)
- Service files: `kebab-case.ts` (e.g., `apps/engine/src/services/flow-engine.ts`)

**Functions:**
- Use `camelCase` for all functions and methods
- Prefix boolean-returning functions with verbs: `evaluateCondition`, `verifyWebhookSignature`
- Use descriptive verb-noun pairs: `validateFlow`, `analyzeFlow`, `createClinicTemplate`, `calculateAvailability`
- Factory functions: `create` prefix (e.g., `createClinicTemplate`)
- Parse/transform functions: `parse` prefix (e.g., `parseIncomingMessage`)

**Variables:**
- Use `camelCase` for all variables
- Constants at module scope: `UPPER_SNAKE_CASE` (e.g., `BRAND`, `BLOCK_TYPES`, `DEFAULT_FLOW`, `CALENDAR_API`)
- Use descriptive names: `nodeMap`, `busySlots`, `possibleSlots`, `referencedIds`

**Types:**
- Use `PascalCase` for all types and interfaces
- Prefer `type` over `interface` unless extending
- Zod schemas and their inferred types share the same name using TypeScript declaration merging:
  ```typescript
  export const FlowNode = z.object({ ... });
  export type FlowNode = z.infer<typeof FlowNode>;
  ```
- Discriminated unions use `type` field: `OutgoingMessage`, `SideEffect`
- Config types suffixed with `Config`: `WhatsAppConfig`, `CalendarConfig`, `AppointmentConfig`, `ProfessionalConfig`
- Request/result types suffixed accordingly: `AvailabilityRequest`, `BookingRequest`, `BookingResult`, `SendMessageResult`

**Database (Drizzle):**
- Table names: `snake_case`, plural (e.g., `accounts`, `whatsapp_connections`, `bot_versions`)
- Column names: `snake_case` in SQL (e.g., `account_id`, `created_at`)
- Drizzle schema variable names: `camelCase` in TypeScript (e.g., `accountId`, `createdAt`)
- Foreign keys: `{table_singular}_id` (e.g., `bot_id`, `account_id`, `conversation_id`)
- Enum names: `camelCase` + `Enum` suffix (e.g., `planEnum`, `botStatusEnum`, `appointmentStatusEnum`)
- Index names: `{table}_{column}_idx` (e.g., `accounts_email_idx`, `bots_account_idx`)

**Packages:**
- Scoped under `@zapbot/` namespace: `@zapbot/engine`, `@zapbot/flow-schema`, `@zapbot/whatsapp`, `@zapbot/calendar`, `@zapbot/db`

## Code Style

**Formatting:**
- Prettier configured via root `package.json` script: `prettier --write "**/*.{ts,tsx,js,json,md}"`
- No `.prettierrc` config file exists — uses Prettier defaults
- Default settings apply: double quotes, semicolons, 80-char print width
- Actual codebase uses double quotes consistently (observed in all source files)

**Linting:**
- No ESLint config exists (`.eslintrc*` not found)
- `turbo lint` task defined in `turbo.json` but no linter configured yet
- TypeScript strict mode serves as primary quality gate

**TypeScript Strictness:**
- `"strict": true` in root `tsconfig.json`
- Target: `ES2022`
- Module: `ESNext` with `bundler` moduleResolution
- `forceConsistentCasingInFileNames`: true
- `isolatedModules`: true
- `resolveJsonModule`: true
- No `any` permitted — use `unknown` and narrow (project rule)

## Import Organization

**Order (observed pattern):**
1. Node.js built-ins (e.g., `import crypto from "node:crypto"`)
2. Third-party packages (e.g., `import Fastify from "fastify"`, `import { z } from "zod"`)
3. Internal workspace packages (e.g., `import type { BotFlow } from "@zapbot/flow-schema"`)
4. Side-effect imports last (e.g., `import "dotenv/config"`)

**Path Aliases:**
- No path aliases configured; workspace packages use `@zapbot/*` via pnpm workspaces
- Internal package references use `workspace:*` in `package.json`
- Direct `./` relative imports within packages

**Import Style:**
- Use `import type` for type-only imports:
  ```typescript
  import type { BotFlow, FlowNode, FlowOption } from "@zapbot/flow-schema";
  import type { ParsedMessage } from "@zapbot/whatsapp";
  ```
- Named imports preferred over namespace imports
- No default exports except Next.js pages and the editor prototype

## Error Handling

**Patterns:**

1. **Custom Error Classes** — For domain-specific errors with extra context:
   ```typescript
   // packages/whatsapp/src/index.ts
   export class WhatsAppApiError extends Error {
     constructor(
       message: string,
       public statusCode: number,
       public details: unknown
     ) {
       super(message);
       this.name = "WhatsAppApiError";
     }
   }
   ```

2. **Thrown Errors with JSON context** — For external API failures:
   ```typescript
   // packages/calendar/src/index.ts
   throw new Error(`Google OAuth error: ${JSON.stringify(error)}`);
   throw new Error(`Google Calendar API error ${response.status}: ${JSON.stringify(error)}`);
   ```

3. **Zod safeParse for validation** — Return `{ success, data?, errors? }` objects instead of throwing:
   ```typescript
   // packages/flow-schema/src/index.ts
   export function validateFlow(flow: unknown): {
     success: boolean;
     data?: BotFlow;
     errors?: z.ZodError;
   } {
     const result = BotFlow.safeParse(flow);
     if (result.success) return { success: true, data: result.data };
     return { success: false, errors: result.error };
   }
   ```

4. **Try-catch with logging** — At application boundaries (server entry points):
   ```typescript
   // apps/engine/src/server.ts
   try {
     await app.listen({ port, host: "0.0.0.0" });
   } catch (err) {
     app.log.error(err);
     process.exit(1);
   }
   ```

5. **Graceful degradation for missing config** — Return early or log warnings:
   ```typescript
   // packages/whatsapp/src/index.ts
   if (!this.config.appSecret) {
     console.warn("WhatsApp appSecret not configured — skipping signature verification");
     return true;
   }
   ```

6. **User-facing errors in pt-BR** — Bot-facing error messages use Portuguese:
   ```typescript
   output.messages.push({ type: "text", body: "Desculpe, ocorreu um erro. Tente novamente mais tarde." });
   ```

**API Error Format (prescribed):**
```typescript
{ error: string, code: string, details?: unknown }
```

## Logging

**Framework:** Fastify built-in logger (`pino`)

**Patterns:**
- Use `app.log.info()`, `app.log.error()`, `app.log.warn()` in Fastify server context
- Structured logging with objects: `app.log.info({ body }, "Received WhatsApp webhook")`
- `console.warn()` used in library packages (whatsapp client) — avoid in app code, prefer Fastify logger
- Error logging includes the error object as first argument: `app.log.error(error, "Error processing...")`

## Comments

**Section Dividers:**
- Use `=` line separators for major sections within files:
  ```typescript
  // =============================================================================
  // Section Name
  // =============================================================================
  ```
- Use `-` line separators for subsections within classes:
  ```typescript
  // ---------------------------------------------------------------------------
  // Subsection Name
  // ---------------------------------------------------------------------------
  ```

**JSDoc:**
- Use JSDoc for public functions and classes with brief description:
  ```typescript
  /** Send a plain text message */
  async sendText(to: string, body: string): Promise<SendMessageResult> { ... }
  ```
- Multi-line JSDoc for complex functions:
  ```typescript
  /**
   * Check for structural issues in a flow:
   * - Unreachable nodes
   * - Dead-end nodes
   * - Missing node references
   * - Duplicate IDs
   */
  export function analyzeFlow(flow: BotFlow): FlowAnalysis { ... }
  ```

**Inline Comments:**
- Explain "why" not "what"
- Use `// TODO:` for planned work (observed in `apps/engine/src/server.ts`, `apps/engine/src/services/flow-engine.ts`)
- Zod schema fields get inline comments for domain constraints: `// WhatsApp button text limit`, `// WhatsApp max 3 buttons`

## Function Design

**Size:** Keep functions focused. Longest method in `FlowEngine` is `executeNode` at ~100 lines (switch statement covering all node types). Most functions are under 30 lines.

**Parameters:**
- Use config/options objects for 3+ parameters:
  ```typescript
  export async function calculateAvailability(
    accessToken: string,
    req: AvailabilityRequest
  ): Promise<AvailabilitySlot[]>
  ```
- Constructor injection for class dependencies:
  ```typescript
  constructor(config: WhatsAppConfig) { ... }
  constructor(flow: BotFlow) { ... }
  ```

**Return Values:**
- Async operations return `Promise<T>` with specific types
- Validation returns `{ success: boolean, data?, errors? }` pattern
- Parse operations return `T | null` for optional results
- Void operations return `Promise<void>`

## Module Design

**Exports:**
- Prefer named exports over default exports
- Export types alongside their Zod schemas from same file
- Barrel files (`index.ts`) re-export from internal modules:
  ```typescript
  // packages/db/src/index.ts
  export * from "./schema/index";
  ```
- Classes exported for stateful services: `WhatsAppClient`, `FlowEngine`
- Functions exported for stateless operations: `validateFlow`, `calculateAvailability`, `getAuthUrl`

**Barrel Files:**
- Each package has `src/index.ts` as its entry point
- `package.json` references `"main": "./src/index.ts"` and `"types": "./src/index.ts"` (source-level, no build step for dev)

**Module Pattern:**
- Packages are either class-based (WhatsApp client, FlowEngine) or function-based (calendar, flow-schema validation)
- No mixing: a module is either a class with methods or a collection of exported functions
- Private helpers stay unexported: `calendarFetch`, `generatePossibleSlots`

## Zod Schema Conventions

**Pattern:** Define Zod schema first, then derive TypeScript type:
```typescript
export const FlowOption = z.object({
  label: z.string().min(1).max(20),
  value: z.string().min(1),
  next: z.string().min(1),
});
export type FlowOption = z.infer<typeof FlowOption>;
```

**Validation Constraints:**
- Include WhatsApp API limits in schema (max 3 buttons, max 20 char button text, max 4096 char message body)
- Use `.refine()` for cross-field validation (e.g., buttons must have options, collect must have field)
- Use `.default()` for optional config values with sensible defaults

**Shared schemas live in `packages/flow-schema/`** and are imported by both the engine and the future web frontend.

## React Conventions (Editor Prototype)

**Note:** The editor prototype at `ZapBot_Editor_Prototype.jsx` is a standalone JSX file, not part of the monorepo build. It uses older React patterns.

**Component Naming:** `PascalCase` function components (e.g., `PhoneSimulator`, `BlockCard`, `ZapBotEditor`)
**State:** `useState` hooks with descriptive names
**Callbacks:** `useCallback` for expensive computations passed as props
**Refs:** `useRef` for DOM references (scroll container)
**Styling:** Inline styles with JavaScript objects (prototype only; production will use Tailwind CSS)
**User-facing text:** All in Portuguese (pt-BR)

---

*Convention analysis: 2026-02-17*

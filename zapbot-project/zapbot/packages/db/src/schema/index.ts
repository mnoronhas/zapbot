import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// =============================================================================
// Enums
// =============================================================================

export const planEnum = pgEnum("plan", ["free", "professional", "clinic_plus"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended", "cancelled"]);
export const botStatusEnum = pgEnum("bot_status", ["draft", "published", "paused"]);
export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "completed",
  "handed_off",
  "expired",
]);
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
export const waConnectionStatusEnum = pgEnum("wa_connection_status", [
  "pending",
  "connected",
  "disconnected",
  "error",
]);

// =============================================================================
// Accounts (tenants)
// =============================================================================

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  businessPhone: varchar("business_phone", { length: 20 }),
  businessType: varchar("business_type", { length: 50 }),
  businessAddress: text("business_address"),
  plan: planEnum("plan").notNull().default("free"),
  status: accountStatusEnum("status").notNull().default("active"),
  supabaseUserId: uuid("supabase_user_id").notNull(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("accounts_email_idx").on(table.email),
  uniqueIndex("accounts_supabase_user_idx").on(table.supabaseUserId),
]);

// =============================================================================
// WhatsApp Connections
// =============================================================================

export const whatsappConnections = pgTable("whatsapp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  phoneNumberId: varchar("phone_number_id", { length: 64 }).notNull(),
  wabaId: varchar("waba_id", { length: 64 }).notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  webhookVerifyToken: varchar("webhook_verify_token", { length: 255 }).notNull(),
  displayPhoneNumber: varchar("display_phone_number", { length: 20 }),
  status: waConnectionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("wa_connections_account_idx").on(table.accountId),
]);

// =============================================================================
// Bots
// =============================================================================

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull().default("Meu Bot"),
  flowJson: jsonb("flow_json").notNull(), // BotFlow schema
  status: botStatusEnum("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bots_account_idx").on(table.accountId),
]);

// =============================================================================
// Bot Versions (for rollback)
// =============================================================================

export const botVersions = pgTable("bot_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  flowJson: jsonb("flow_json").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bot_versions_bot_idx").on(table.botId),
]);

// =============================================================================
// Calendar Configs
// =============================================================================

export const calendarConfigs = pgTable("calendar_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  googleRefreshTokenEncrypted: text("google_refresh_token_encrypted").notNull(),
  googleAccessToken: text("google_access_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at", { withTimezone: true }),
  calendarId: varchar("calendar_id", { length: 255 }).notNull(),
  // Professional schedule config (JSONB for flexibility)
  professionals: jsonb("professionals").notNull().default("[]"),
  // Default schedule
  availableDays: jsonb("available_days").notNull().default("[1,2,3,4,5]"), // Mon-Fri
  availableHours: jsonb("available_hours").notNull().default('{"start":"08:00","end":"18:00"}'),
  defaultBufferMinutes: integer("default_buffer_minutes").notNull().default(15),
  maxAdvanceDays: integer("max_advance_days").notNull().default(60),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("calendar_configs_account_idx").on(table.accountId),
]);

// =============================================================================
// Conversations
// =============================================================================

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  contactPhone: varchar("contact_phone", { length: 20 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  currentNodeId: varchar("current_node_id", { length: 64 }),
  variables: jsonb("variables").notNull().default("{}"),
  status: conversationStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("conversations_account_idx").on(table.accountId),
  index("conversations_bot_idx").on(table.botId),
  index("conversations_phone_idx").on(table.contactPhone),
  index("conversations_status_idx").on(table.status),
]);

// =============================================================================
// Messages
// =============================================================================

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 32 }).notNull().default("text"),
  waMessageId: varchar("wa_message_id", { length: 128 }),
  nodeId: varchar("node_id", { length: 64 }), // Which flow node generated/received this
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("messages_conversation_idx").on(table.conversationId),
  index("messages_wa_id_idx").on(table.waMessageId),
]);

// =============================================================================
// Appointments
// =============================================================================

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "set null" }),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientPhone: varchar("patient_phone", { length: 20 }).notNull(),
  professional: varchar("professional", { length: 255 }),
  appointmentType: varchar("appointment_type", { length: 32 }), // "first", "return"
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  googleEventId: varchar("google_event_id", { length: 255 }),
  status: appointmentStatusEnum("status").notNull().default("confirmed"),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("appointments_account_idx").on(table.accountId),
  index("appointments_start_idx").on(table.startTime),
  index("appointments_status_idx").on(table.status),
  index("appointments_phone_idx").on(table.patientPhone),
]);

// =============================================================================
// Analytics Events (lightweight event tracking)
// =============================================================================

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  botId: uuid("bot_id")
    .references(() => bots.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 64 }).notNull(), // "conversation_started", "node_reached", "drop_off", "appointment_booked"
  nodeId: varchar("node_id", { length: 64 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("analytics_account_idx").on(table.accountId),
  index("analytics_event_type_idx").on(table.eventType),
  index("analytics_created_idx").on(table.createdAt),
]);

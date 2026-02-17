CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."bot_status" AS ENUM('draft', 'published', 'paused');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'completed', 'handed_off', 'expired');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'professional', 'clinic_plus');--> statement-breakpoint
CREATE TYPE "public"."wa_connection_status" AS ENUM('pending', 'connected', 'disconnected', 'error');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"business_name" varchar(255) NOT NULL,
	"business_phone" varchar(20),
	"business_type" varchar(50),
	"business_address" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"supabase_user_id" uuid NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"bot_id" uuid,
	"conversation_id" uuid,
	"event_type" varchar(64) NOT NULL,
	"node_id" varchar(64),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"conversation_id" uuid,
	"patient_name" varchar(255) NOT NULL,
	"patient_phone" varchar(20) NOT NULL,
	"professional" varchar(255),
	"appointment_type" varchar(32),
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"google_event_id" varchar(255),
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bot_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"flow_json" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(255) DEFAULT 'Meu Bot' NOT NULL,
	"flow_json" jsonb NOT NULL,
	"status" "bot_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"google_refresh_token_encrypted" text NOT NULL,
	"google_access_token" text,
	"google_token_expires_at" timestamp with time zone,
	"calendar_id" varchar(255) NOT NULL,
	"professionals" jsonb DEFAULT '[]' NOT NULL,
	"available_days" jsonb DEFAULT '[1,2,3,4,5]' NOT NULL,
	"available_hours" jsonb DEFAULT '{"start":"08:00","end":"18:00"}' NOT NULL,
	"default_buffer_minutes" integer DEFAULT 15 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_configs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	"contact_name" varchar(255),
	"current_node_id" varchar(64),
	"variables" jsonb DEFAULT '{}' NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar(32) DEFAULT 'text' NOT NULL,
	"wa_message_id" varchar(128),
	"node_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"phone_number_id" varchar(64) NOT NULL,
	"waba_id" varchar(64) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"webhook_verify_token" varchar(255) NOT NULL,
	"display_phone_number" varchar(20),
	"status" "wa_connection_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_versions" ADD CONSTRAINT "bot_versions_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_configs" ADD CONSTRAINT "calendar_configs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_idx" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_supabase_user_idx" ON "accounts" USING btree ("supabase_user_id");--> statement-breakpoint
CREATE INDEX "analytics_account_idx" ON "analytics_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "analytics_event_type_idx" ON "analytics_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "analytics_created_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "appointments_account_idx" ON "appointments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "appointments_start_idx" ON "appointments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_phone_idx" ON "appointments" USING btree ("patient_phone");--> statement-breakpoint
CREATE INDEX "bot_versions_bot_idx" ON "bot_versions" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bots_account_idx" ON "bots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "calendar_configs_account_idx" ON "calendar_configs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "conversations_account_idx" ON "conversations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "conversations_bot_idx" ON "conversations" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "conversations_phone_idx" ON "conversations" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_wa_id_idx" ON "messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "wa_connections_account_idx" ON "whatsapp_connections" USING btree ("account_id");--> statement-breakpoint
CREATE POLICY "accounts_tenant_isolation" ON "accounts" AS PERMISSIVE FOR ALL TO "authenticated" USING (supabase_user_id = auth.uid()) WITH CHECK (supabase_user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "analytics_events_tenant_isolation" ON "analytics_events" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));--> statement-breakpoint
CREATE POLICY "appointments_tenant_isolation" ON "appointments" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));--> statement-breakpoint
CREATE POLICY "bot_versions_tenant_isolation" ON "bot_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING (bot_id IN (
      SELECT id FROM bots
      WHERE account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)
    )) WITH CHECK (bot_id IN (
      SELECT id FROM bots
      WHERE account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)
    ));--> statement-breakpoint
CREATE POLICY "bots_tenant_isolation" ON "bots" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));--> statement-breakpoint
CREATE POLICY "calendar_configs_tenant_isolation" ON "calendar_configs" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));--> statement-breakpoint
CREATE POLICY "conversations_tenant_isolation" ON "conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)
    )) WITH CHECK (conversation_id IN (
      SELECT id FROM conversations
      WHERE account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)
    ));--> statement-breakpoint
CREATE POLICY "wa_connections_tenant_isolation" ON "whatsapp_connections" AS PERMISSIVE FOR ALL TO "authenticated" USING (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
)) WITH CHECK (account_id = (
  SELECT id FROM accounts
  WHERE supabase_user_id = auth.uid()
));
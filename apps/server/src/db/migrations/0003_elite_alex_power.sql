CREATE TABLE "hermes_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"s3_artifact_key" text,
	"token_usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hermes_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hermes_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"api_key_encrypted" text,
	"model" text DEFAULT 'nousresearch/hermes-3-llama-3.1-405b' NOT NULL,
	"temperature" integer DEFAULT 70 NOT NULL,
	"context_window" integer DEFAULT 128000 NOT NULL,
	"execution_backend" text DEFAULT 'docker' NOT NULL,
	"container_cpu" integer DEFAULT 2 NOT NULL,
	"container_memory_mb" integer DEFAULT 4096 NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"command_approval_mode" text DEFAULT 'ask_destructive' NOT NULL,
	"persistent_memory" boolean DEFAULT true NOT NULL,
	"auto_skill_creation" boolean DEFAULT false NOT NULL,
	"system_prompt" text,
	"enabled_tools" jsonb DEFAULT '["shell","web_search","code_runner"]'::jsonb,
	"s3_archiving_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "settings" jsonb DEFAULT '{"theme":"dark","palette":"default"}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hermes_messages" ADD CONSTRAINT "hermes_messages_session_id_hermes_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."hermes_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_sessions" ADD CONSTRAINT "hermes_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_settings" ADD CONSTRAINT "hermes_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
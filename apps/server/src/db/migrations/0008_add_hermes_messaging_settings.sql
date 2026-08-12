CREATE TABLE IF NOT EXISTS "hermes_messaging_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"telegram_bot_token" text,
	"telegram_allowed_users" text,
	"telegram_allowed_chats" text,
	"telegram_group_allowed_chats" text,
	"telegram_require_mention" boolean DEFAULT true NOT NULL,
	"telegram_status_indicator" boolean DEFAULT true NOT NULL,
	"telegram_status_online" text DEFAULT '🟢 Online',
	"telegram_status_offline" text DEFAULT '🔴 Offline',
	"telegram_command_menu_max" integer DEFAULT 60,
	"telegram_command_menu_priority_mode" text DEFAULT 'prepend',
	"telegram_observe_unmentioned" boolean DEFAULT false NOT NULL,
	"telegram_webhook_url" text,
	"telegram_webhook_secret" text,
	"telegram_webhook_port" integer DEFAULT 8443,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_access_token" text,
	"whatsapp_phone_number_id" text,
	"whatsapp_waba_id" text,
	"whatsapp_verify_token" text,
	"whatsapp_allowed_users" text,
	"whatsapp_text_batch_delay" integer DEFAULT 2,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email_address" text,
	"email_password" text,
	"email_imap_host" text DEFAULT 'imap.gmail.com',
	"email_smtp_host" text DEFAULT 'smtp.gmail.com',
	"email_imap_port" integer DEFAULT 993,
	"email_smtp_port" integer DEFAULT 587,
	"email_poll_interval" integer DEFAULT 15,
	"email_allowed_users" text,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"webhook_port" integer DEFAULT 8644,
	"webhook_secret" text,
	"webhook_routes" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_messaging_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hermes_messaging_settings_user_id_users_id_fk') THEN
    ALTER TABLE "hermes_messaging_settings" ADD CONSTRAINT "hermes_messaging_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "hermes_settings" ADD COLUMN IF NOT EXISTS "webui_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "hermes_settings" ADD COLUMN IF NOT EXISTS "webui_port" integer DEFAULT 8787 NOT NULL;
ALTER TABLE "hermes_settings" ADD COLUMN IF NOT EXISTS "webui_password" text;

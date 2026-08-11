CREATE TABLE IF NOT EXISTS "hermes_browser_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'local_chromium' NOT NULL,
	"backend" text DEFAULT 'auto' NOT NULL,
	"headless" boolean DEFAULT true NOT NULL,
	"headed" boolean DEFAULT false NOT NULL,
	"cdp_url" text DEFAULT 'wss://kitesurf.cloudflare.app/devtools/browser',
	"vision_enabled" boolean DEFAULT true NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"inactivity_timeout" integer DEFAULT 120 NOT NULL,
	"record_sessions" boolean DEFAULT false NOT NULL,
	"proxy_url" text,
	"auto_local_for_private_urls" boolean DEFAULT true NOT NULL,
	"allow_private_urls" boolean DEFAULT false NOT NULL,
	"restrict_evaluate" boolean DEFAULT false NOT NULL,
	"dialog_policy" text DEFAULT 'must_respond' NOT NULL,
	"dialog_timeout_s" integer DEFAULT 30 NOT NULL,
	"agent_browser_args" text DEFAULT '--no-sandbox,--disable-dev-shm-usage',
	"kitesurf_mcp_enabled" boolean DEFAULT true NOT NULL,
	"kitesurf_account_token" text,
	"browserbase_api_key" text,
	"browserbase_project_id" text,
	"browserbase_proxies" boolean DEFAULT true NOT NULL,
	"browserbase_advanced_stealth" boolean DEFAULT false NOT NULL,
	"browserbase_keep_alive" boolean DEFAULT true NOT NULL,
	"browserbase_session_timeout" integer DEFAULT 1800 NOT NULL,
	"browser_use_api_key" text,
	"firecrawl_api_key" text,
	"firecrawl_api_url" text DEFAULT 'https://api.firecrawl.dev',
	"firecrawl_browser_ttl" integer DEFAULT 300 NOT NULL,
	"camofox_url" text DEFAULT 'http://localhost:9377',
	"camofox_rewrite_loopback_urls" boolean DEFAULT true NOT NULL,
	"camofox_loopback_host_alias" text DEFAULT 'host.docker.internal',
	"camofox_managed_persistence" boolean DEFAULT true NOT NULL,
	"camofox_user_id" text,
	"camofox_session_key" text,
	"camofox_adopt_existing_tab" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hermes_browser_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hermes_browser_settings_user_id_users_id_fk') THEN
    ALTER TABLE "hermes_browser_settings" ADD CONSTRAINT "hermes_browser_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

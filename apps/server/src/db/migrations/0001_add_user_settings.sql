ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{"theme":"dark","palette":"default"}'::jsonb;

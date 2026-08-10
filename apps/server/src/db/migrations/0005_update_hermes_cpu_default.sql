ALTER TABLE "hermes_settings" ALTER COLUMN "container_cpu" SET DEFAULT 0;
UPDATE "hermes_settings" SET "container_cpu" = 0 WHERE "container_cpu" = 2;

import { defineConfig } from 'drizzle-kit';
import { config } from './apps/server/src/config.js';

export default defineConfig({
  schema: './apps/server/src/db/schema.ts',
  out: './apps/server/src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});

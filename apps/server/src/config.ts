import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),

  // Auth
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('30d'),
  ENCRYPTION_KEY: z.string().min(32),

  // Database
  DATABASE_URL: z.string(),

  // Cellar / S3
  CELLAR_ADDON_HOST: z.string(),
  CELLAR_ADDON_KEY_ID: z.string(),
  CELLAR_ADDON_KEY_SECRET: z.string(),
  CELLAR_BUCKET: z.string().default('clever-coder'),
  CELLAR_REGION: z.string().default('default'),
  S3_FORCE_PATH_STYLE: z.string().transform(v => v === 'true').default('true'),

  // Sync
  SYNC_INTERVAL_MS: z.coerce.number().default(15000),
  SYNC_DEBOUNCE_MS: z.coerce.number().default(3000),
  IDLE_IDE_TIMEOUT_MIN: z.coerce.number().default(20),

  // Workspaces
  WORKSPACES_ROOT: z.string().default('/workspaces'),

  // GitHub OAuth
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),

  // AI (optional)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌  Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
  }
  _config = parsed.data;
  return _config;
}

// Convenience getter
export const config = new Proxy({} as Config, {
  get(_, prop: string) {
    return getConfig()[prop as keyof Config];
  },
});

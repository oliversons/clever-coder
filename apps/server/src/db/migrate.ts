import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Migrations folder is co-located with this file after build:
//   dist/db/migrate.js → dist/db/migrations/
const migrationsFolder = join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  console.log('[db] Running migrations from:', migrationsFolder);
  const db = getDb();
  await migrate(db, { migrationsFolder });
  console.log('[db] Migrations complete.');
}

// Allow running as a standalone script: node dist/db/migrate.js
if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(() => closeDb())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

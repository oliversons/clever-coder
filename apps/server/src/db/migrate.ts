import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('Running DB migrations...');
  const db = getDb();
  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  console.log('Migrations complete.');
  await closeDb();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

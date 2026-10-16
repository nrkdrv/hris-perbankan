/** Global setup integration test: nyalakan embedded PG + migrate deploy. */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startEmbeddedPostgres } from './embedded-pg.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(testDir, '..');

export default async function setup() {
  const db = await startEmbeddedPostgres(5434);
  process.env.DATABASE_URL = db.url;
  execSync('pnpm prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: db.url },
    stdio: 'inherit',
  });
  return async () => {
    await db.stop();
  };
}

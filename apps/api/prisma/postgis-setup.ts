/** Menjalankan prisma/postgis-setup.sql ke DATABASE_URL. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const dir = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(dir, 'postgis-setup.sql'), 'utf8');

const prisma = new PrismaClient();
async function main() {
  // Eksekusi per statement (Prisma $executeRaw tidak menerima multi-statement).
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('PostGIS setup OK');
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

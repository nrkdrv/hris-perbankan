/** Helper embedded PostgreSQL untuk integration test & verifikasi lokal. */
import { EmbeddedPostgres } from 'embedded-postgres';

export interface EmbeddedDb {
  url: string;
  stop: () => Promise<void>;
}

export async function startEmbeddedPostgres(port = 5434): Promise<EmbeddedDb> {
  const pg = new EmbeddedPostgres({
    database: 'hris_bank',
    username: 'hris',
    password: 'hris',
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  const url = `postgresql://hris:hris@127.0.0.1:${port}/hris_bank?schema=public`;
  return {
    url,
    stop: async () => {
      await pg.stop();
    },
  };
}

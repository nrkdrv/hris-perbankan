import EmbeddedPostgres from 'embedded-postgres';
const pg = new EmbeddedPostgres({
  database: 'hris_bank', username: 'hris', password: 'hris',
  port: 5433, persistent: true, createPostgresUser: true,
});
await pg.initialise();
await pg.start();
console.log('EMBEDDED_PG_READY on 5433');
await new Promise(() => {});

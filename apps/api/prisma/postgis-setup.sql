-- Dipasang SETELAH `prisma migrate dev` via `pnpm db:postgis`.
-- Menambah kolom geografi PostGIS + indeks spasial GIST di tabel branches.
-- Dijalankan terpisah (bukan migration Prisma) supaya tidak menimbulkan drift.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "geom" geography(Point, 4326)
  GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
  ) STORED;

CREATE INDEX IF NOT EXISTS "branches_geom_gist" ON "branches" USING GIST ("geom");

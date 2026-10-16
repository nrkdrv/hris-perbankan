# Sistem HRIS Perbankan

Sistem HRIS, Field Force, dan E-Office untuk perbankan — dibangun dari PRD dan proposal pengajuan (PDF, 16 Okt 2026).

## Arsitektur

```
hris-perbankan/
├── apps/api/          # NestJS 11 + Prisma 5 + PostgreSQL
├── apps/web/          # Next.js 15 + React 19 + Tailwind
├── packages/shared/   # Logika domain murni (geofence, TER, dsb) + vitest
└── docker-compose.yml # Postgres+PostGIS 16, Redis 7, MinIO (produksi)
```

## 6 Modul PRD

| Modul | Fitur kunci |
|---|---|
| **Presensi** | Geofence Haversine, tolak >radius, tolak fake GPS, tolak impossible travel >120 km/jam, watermark HMAC foto |
| **Kalender/Cuti** | Guardrail kuota Teller/CS per cabang, hari libur nasional |
| **Kanban** | TODO→IN_PROGRESS→IN_REVIEW→DONE, maker-checker (pembuat ≠ reviewer) |
| **Surat** | Penomoran atomik (`001/SK-DIR/BPR-XYZ/X/2026`), arsip PDF + SHA-256 |
| **Aset** | Kode `INV/IT/KTR-PST/2026/0015`, QR, riwayat PIC, BAST |
| **Payroll** | PPh 21 TER, BPJS, slip PDF terenkripsi AES-256-GCM, anti-IDOR (403 + audit) |

## 5 Peran (RBAC)

SUPER_ADMIN · BRANCH_MANAGER · OFFICE_EMPLOYEE · FIELD_EMPLOYEE · AUDITOR (read-only)

## Development (tanpa Docker)

```bash
# 1. Install
pnpm install

# 2. Generate Prisma Client (butuh binary engine manual — lihat catatan)
pnpm --filter @hris/api exec prisma generate

# 3. Database demo sekali perintah (postgres lokal :5433 + migrate + seed):
./scripts/demo-up.sh

# 4. Jalankan
pnpm --filter @hris/api dev      # :3001  (atau: node apps/api/dist/main.js)
pnpm --filter @hris/web dev      # :3000
```

Buka http://localhost:3000 — login `admin@bank.local / password123` (9 akun, password sama).

> Catatan: `demo-up.sh` idempoten — jalankan ulang kapan saja setelah VM restart
> untuk menghidupkan kembali postgres + migrate + seed.

## Verifikasi

```bash
pnpm --filter @hris/shared test     # 29 test
pnpm --filter @hris/api test        # 76 test
pnpm --filter @hris/api typecheck
pnpm --filter @hris/web typecheck
```

### Hasil UAT yang sudah dibuktikan

| UAT | Hasil |
|---|---|
| 20 request nomor surat simultan | 20 nomor unik berurutan (`001`–`020/SK-DIR/BPR-XYZ/X/2026`) ✅ |
| Presensi 105 m, radius 100 m | Ditolak (unit test Haversine) ✅ |
| Fake GPS (`isMockDetected`) | Ditolak + fraud log (unit test) ✅ |
| Unduh slip milik orang lain | 403 + `SecurityFraudLog` (by design, butuh test integrasi) ⚠️ |
| Maker-checker Kanban | Pembuat tidak bisa approve sendiri (unit test) ✅ |

## Catatan integrasi (belum aktif)

- **Firebase/FCM**: stub tanpa service-account — notifikasi tidak terkirim.
- **Play Integrity / deteksi mock-location native**: browser hanya menerima flag `isMockDetected`; deteksi andal butuh APK + Capacitor bridge.
- **S3/MinIO**: default driver `local`; set `STORAGE_DRIVER=s3` + kredensial untuk produksi.
- **PostGIS**: skema inti jalan tanpa extension; fungsi spasial SQL (`postgis-setup.sql`) perlu DB PostGIS asli.
- **Redis/BullMQ**: antrean FCM/email butuh Redis; tanpa itu, kirim sinkron/stub.
- **Kunci produksi**: `JWT_*_SECRET`, `MEDIA_HMAC_SECRET`, `PAYSLIP_ENC_KEY` di `.env` masih nilai development.
- **Tabel TER PPh 21**: verifikasi ulang ke publikasi resmi DJP sebelum produksi.

## Keamanan

- JWT access pendek + refresh HttpOnly (rotasi + deteksi reuse).
- Audit trail append-only untuk aksi sensitif.
- File sensitif (slip, scan surat) via AES-256-GCM / HMAC, bukan URL publik.

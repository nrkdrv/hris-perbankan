import { describe, expect, it } from 'vitest';
import { buildAssetCode } from '@hris/shared';
import { buildBastPdf, computeDepreciation, fullMonthsBetween } from './assets.util';

describe('computeDepreciation (garis lurus)', () => {
  it('aset 12jt / 12 bulan, dipakai 6 bulan → nilai buku 6jt', () => {
    const now = new Date('2026-10-16T00:00:00');
    const acquired = new Date('2026-04-16T00:00:00');
    const r = computeDepreciation(12_000_000, 12, acquired, now);
    expect(r.monthlyDepreciation).toBe(1_000_000);
    expect(r.bookValue).toBe(6_000_000);
  });

  it('melewati masa manfaat → nilai buku 0 (tidak negatif)', () => {
    const now = new Date('2028-01-01T00:00:00');
    const acquired = new Date('2026-01-01T00:00:00');
    const r = computeDepreciation(12_000_000, 12, acquired, now);
    expect(r.bookValue).toBe(0);
  });

  it('tanpa tanggal perolehan → penyusutan jalan tapi nilai buku = biaya perolehan', () => {
    const r = computeDepreciation(12_000_000, 12, null, new Date('2026-10-16T00:00:00'));
    expect(r.monthlyDepreciation).toBe(1_000_000);
    expect(r.bookValue).toBe(12_000_000);
  });

  it('data tidak lengkap → null', () => {
    expect(computeDepreciation(null, 12, new Date(), new Date())).toEqual({
      monthlyDepreciation: null,
      bookValue: null,
    });
    expect(computeDepreciation(12_000_000, null, new Date(), new Date())).toEqual({
      monthlyDepreciation: null,
      bookValue: null,
    });
  });

  it('fullMonthsBetween menghitung bulan penuh', () => {
    expect(fullMonthsBetween(new Date('2026-04-16'), new Date('2026-10-16'))).toBe(6);
    expect(fullMonthsBetween(new Date('2026-04-20'), new Date('2026-10-16'))).toBe(5);
  });

  it('konsisten dengan buildAssetCode untuk kode unik', () => {
    expect(buildAssetCode('IT', 'KTR-PST', 2026, 1)).toBe('INV/IT/KTR-PST/2026/0001');
  });
});

describe('buildBastPdf', () => {
  it('menghasilkan buffer PDF valid', async () => {
    const buf = await buildBastPdf({
      assetCode: 'INV/IT/KTR-PST/2026/0015',
      assetName: 'Laptop ThinkPad',
      serialNumber: 'SN123',
      branchName: 'Kantor Pusat Jakarta',
      fromName: 'GA Officer',
      fromNip: 'GA-001',
      toName: 'Agus Wijaya',
      toNip: 'AO-001',
      handoverDate: new Date('2026-10-16T00:00:00'),
      notes: 'Kondisi baik',
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

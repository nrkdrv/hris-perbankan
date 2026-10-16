import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  buildAssetCode,
  buildLetterNumber,
  pad3,
  pad4,
  toRomanMonth,
} from '@hris/shared';

describe('buildLetterNumber', () => {
  it('format 042/SK-DIR/BPR-XYZ/X/2026', () => {
    const n = buildLetterNumber(42, 'SK_DIR', 'BPR-XYZ', new Date('2026-10-16T00:00:00'));
    expect(n).toBe('042/SK-DIR/BPR-XYZ/X/2026');
  });

  it('nomor urut 1 → 001', () => {
    const n = buildLetterNumber(1, 'ST', 'KTR-SBY', new Date('2026-01-05T00:00:00'));
    expect(n).toBe('001/ST/KTR-SBY/I/2026');
  });

  it('kategori tanpa mapping tampil apa adanya', () => {
    const n = buildLetterNumber(7, 'MEMO', 'KTR-PST', new Date('2026-12-01T00:00:00'));
    expect(n).toBe('007/MEMO/KTR-PST/XII/2026');
  });
});

describe('buildAssetCode', () => {
  it('format INV/IT/KTR-PST/2026/0015', () => {
    expect(buildAssetCode('IT', 'KTR-PST', 2026, 15)).toBe('INV/IT/KTR-PST/2026/0015');
  });

  it('urut 1 → 0001', () => {
    expect(buildAssetCode('KENDARAAN', 'KTR-SBY', 2025, 1)).toBe('INV/KENDARAAN/KTR-SBY/2025/0001');
  });
});

describe('util penomoran', () => {
  it('toRomanMonth', () => {
    expect(toRomanMonth(1)).toBe('I');
    expect(toRomanMonth(10)).toBe('X');
    expect(toRomanMonth(12)).toBe('XII');
    expect(() => toRomanMonth(13)).toThrow();
  });

  it('pad3/pad4', () => {
    expect(pad3(42)).toBe('042');
    expect(pad4(15)).toBe('0015');
  });

  it('addWorkingDays melewati akhir pekan', () => {
    // Jumat 2026-10-16 + 1 hari kerja = Senin 2026-10-19
    const jumat = new Date('2026-10-16T10:00:00');
    const hasil = addWorkingDays(jumat, 1);
    expect(hasil.getDay()).toBe(1); // Senin
    expect(hasil.getDate()).toBe(19);
  });

  it('addWorkingDays 3 hari kerja dari Jumat = Rabu', () => {
    const jumat = new Date('2026-10-16T10:00:00');
    const hasil = addWorkingDays(jumat, 3);
    expect(hasil.getDay()).toBe(3); // Rabu
    expect(hasil.getDate()).toBe(21);
  });
});

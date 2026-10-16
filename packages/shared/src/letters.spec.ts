import { describe, expect, it } from 'vitest';
import {
  buildAssetCode,
  buildLetterNumber,
  countWorkingDays,
  pad3,
  toRomanMonth,
} from './letters.js';

describe('toRomanMonth', () => {
  it('Oktober → X', () => expect(toRomanMonth(10)).toBe('X'));
  it('Januari → I', () => expect(toRomanMonth(1)).toBe('I'));
  it('bulan invalid → throw', () => expect(() => toRomanMonth(13)).toThrow());
});

describe('buildLetterNumber', () => {
  it('format PRD: 042/SK-DIR/BPR-XYZ/X/2026', () => {
    expect(buildLetterNumber(42, 'SK_DIR', 'BPR-XYZ', new Date(2026, 9, 5))).toBe(
      '042/SK-DIR/BPR-XYZ/X/2026',
    );
  });
  it('padding 3 digit', () => {
    expect(pad3(7)).toBe('007');
    expect(buildLetterNumber(7, 'ST', 'KTR-SBY', new Date(2026, 0, 1))).toBe(
      '007/ST/KTR-SBY/I/2026',
    );
  });
});

describe('buildAssetCode', () => {
  it('format INV/IT/KTR-PST/2026/0015', () => {
    expect(buildAssetCode('IT', 'KTR-PST', 2026, 15)).toBe('INV/IT/KTR-PST/2026/0015');
  });
});

describe('countWorkingDays', () => {
  it('Senin–Jumat = 5 hari', () => {
    // 19–23 Okt 2026 = Senin–Jumat
    const n = countWorkingDays(new Date(2026, 9, 19), new Date(2026, 9, 23), new Set());
    expect(n).toBe(5);
  });
  it('melewati weekend dihitung benar', () => {
    // Jumat 23 – Senin 26 Okt 2026 → 2 hari kerja
    const n = countWorkingDays(new Date(2026, 9, 23), new Date(2026, 9, 26), new Set());
    expect(n).toBe(2);
  });
  it('hari libur dikecualikan', () => {
    const n = countWorkingDays(
      new Date(2026, 9, 19),
      new Date(2026, 9, 23),
      new Set(['2026-10-21']),
    );
    expect(n).toBe(4);
  });
});

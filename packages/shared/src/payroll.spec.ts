import { describe, expect, it } from 'vitest';
import {
  calculatePayroll,
  pph21TerMonthly,
  ptkpToTerCategory,
  terRateMonthly,
} from './payroll.js';

describe('ptkpToTerCategory', () => {
  it('TK/0 → A', () => expect(ptkpToTerCategory('TK/0')).toBe('A'));
  it('K/0 → A', () => expect(ptkpToTerCategory('K/0')).toBe('A'));
  it('K/1 → B', () => expect(ptkpToTerCategory('K/1')).toBe('B'));
  it('K/3 → C', () => expect(ptkpToTerCategory('K/3')).toBe('C'));
});

describe('terRateMonthly (PP 58/2023)', () => {
  it('kategori A, bruto 10 jt → 2%', () => {
    expect(terRateMonthly('A', 10_000_000)).toBe(0.02);
  });
  it('kategori A, bruto 5 jt → 0%', () => {
    expect(terRateMonthly('A', 5_000_000)).toBe(0);
  });
  it('kategori A, bruto 6 jt → 0.75%', () => {
    expect(terRateMonthly('A', 6_000_000)).toBe(0.0075);
  });
  it('kategori B, bruto 10 jt → 1.5%', () => {
    expect(terRateMonthly('B', 10_000_000)).toBe(0.015);
  });
  it('PPh21 = bruto × tarif, dibulatkan', () => {
    expect(pph21TerMonthly('A', 10_000_000)).toBe(200_000);
  });
});

describe('calculatePayroll', () => {
  it('slip gaji utuh: bruto 10jt TK/0 tanpa potongan lain', () => {
    const r = calculatePayroll({
      earnings: { 'Gaji Pokok': 8_000_000, 'Tunjangan Jabatan': 2_000_000 },
      ptkpStatus: 'TK/0',
      presentDays: 22,
      lateMinutes: 0,
      lateFinePerMinute: 5000,
      loanInstallment: 0,
    });
    expect(r.grossPay).toBe(10_000_000);
    expect(r.terCategory).toBe('A');
    expect(r.pph21).toBe(200_000);
    expect(r.bpjsKes).toBe(100_000); // 1% × 10jt
    expect(r.bpjsJht).toBe(200_000); // 2% × 10jt
    expect(r.bpjsJp).toBe(100_000); // 1% × 10jt
    expect(r.totalDeductions).toBe(600_000);
    expect(r.netTakeHomePay).toBe(9_400_000);
  });

  it('denda keterlambatan & angsuran masuk potongan', () => {
    const r = calculatePayroll({
      earnings: { 'Gaji Pokok': 8_000_000 },
      ptkpStatus: 'TK/0',
      presentDays: 20,
      lateMinutes: 60,
      lateFinePerMinute: 5000,
      loanInstallment: 500_000,
    });
    expect(r.lateFine).toBe(300_000);
    expect(r.deductions['Denda Keterlambatan']).toBe(300_000);
    expect(r.deductions['Angsuran Pinjaman/Koperasi']).toBe(500_000);
  });

  it('batas upah BPJS dihormati (bruto 20jt)', () => {
    const r = calculatePayroll({
      earnings: { 'Gaji Pokok': 20_000_000 },
      ptkpStatus: 'TK/0',
      presentDays: 22,
      lateMinutes: 0,
      lateFinePerMinute: 5000,
      loanInstallment: 0,
    });
    expect(r.bpjsKes).toBe(120_000); // cap 12jt × 1%
    expect(r.bpjsJht).toBe(Math.round(10_042_300 * 0.02));
  });
});

import { describe, expect, it } from 'vitest';
import { calculatePayroll, ptkpToTerCategory } from '@hris/shared';
import { decryptAes256Gcm, encryptAes256Gcm, sha256Hex } from '../core/crypto.util';
import { buildPayslipPdf } from './payroll-pdf';
import { parseCsv, parseRupiah, payslipPassword } from './payroll.service';

describe('calculatePayroll — contoh PRD', () => {
  it('bruto 10jt, TK/0 → PPh21 TER A = 10jt × 2% = 200rb', () => {
    const r = calculatePayroll({
      earnings: { 'Gaji Pokok': 10_000_000 },
      ptkpStatus: 'TK/0',
      presentDays: 0,
      lateMinutes: 0,
      lateFinePerMinute: 5000,
      loanInstallment: 0,
    });
    expect(r.terCategory).toBe('A');
    expect(r.terRate).toBe(0.02);
    expect(r.pph21).toBe(200_000);
    expect(r.grossPay).toBe(10_000_000);
    // BPJS: Kes 1% (cap 12jt) = 100rb; JHT 2% = 200rb; JP 1% = 100rb (bruto 10jt di bawah cap)
    expect(r.bpjsKes).toBe(100_000);
    expect(r.bpjsJht).toBe(200_000);
    expect(r.bpjsJp).toBe(100_000);
    const total = 100_000 + 200_000 + 100_000 + 200_000;
    expect(r.totalDeductions).toBe(total);
    expect(r.netTakeHomePay).toBe(10_000_000 - total);
  });

  it('denda keterlambatan & angsuran masuk potongan', () => {
    const r = calculatePayroll({
      earnings: { 'Gaji Pokok': 8_000_000 },
      ptkpStatus: 'TK/0',
      presentDays: 0,
      lateMinutes: 30,
      lateFinePerMinute: 5000,
      loanInstallment: 500_000,
    });
    expect(r.lateFine).toBe(150_000);
    expect(r.loanInstallment).toBe(500_000);
    expect(r.deductions['Denda Keterlambatan']).toBe(150_000);
    expect(r.deductions['Angsuran Pinjaman/Koperasi']).toBe(500_000);
  });

  it('ptkpToTerCategory', () => {
    expect(ptkpToTerCategory('TK/0')).toBe('A');
    expect(ptkpToTerCategory('K/0')).toBe('A');
    expect(ptkpToTerCategory('TK/2')).toBe('B');
    expect(ptkpToTerCategory('K/3')).toBe('C');
  });
});

describe('enkripsi AES-256-GCM PDF (roundtrip)', () => {
  it('encrypt → decrypt menghasilkan byte identik', async () => {
    const pdf = await buildPayslipPdf({
      fullName: 'Agus Wijaya',
      nip: 'AO-001',
      jobTitle: 'AO Kredit',
      branchName: 'Kantor Cabang Surabaya',
      periodMonth: '2026-10',
      result: calculatePayroll({
        earnings: { 'Gaji Pokok': 8_000_000 },
        ptkpStatus: 'K/0',
        presentDays: 0,
        lateMinutes: 0,
        lateFinePerMinute: 5000,
        loanInstallment: 0,
      }),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const password = payslipPassword(new Date('1990-01-25'), 'AO-001');
    expect(password).toBe('25011990-001'); // DDMMYYYY + 4 digit terakhir NIP
    const enc = encryptAes256Gcm(pdf, password);
    expect(enc.equals(pdf)).toBe(false);
    const dec = decryptAes256Gcm(enc, password);
    expect(dec.equals(pdf)).toBe(true);
  });

  it('password salah → dekripsi gagal', async () => {
    const pdf = Buffer.from('data-rahasia-slip-gaji');
    const enc = encryptAes256Gcm(pdf, 'benar123');
    expect(() => decryptAes256Gcm(enc, 'salah456')).toThrow();
  });

  it('sha256Hex konsisten', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('parseRupiah & parseCsv', () => {
  it('parseRupiah toleran format Indonesia', () => {
    expect(parseRupiah('Rp 1.250.000')).toBe(1_250_000);
    expect(parseRupiah('1,250,000.50')).toBe(1_250_001);
    expect(parseRupiah(5000)).toBe(5000);
    expect(parseRupiah('')).toBe(null);
    expect(parseRupiah('abc')).toBe(null);
  });

  it('parseCsv paham tanda kutip & koma di dalam sel', () => {
    const rows = parseCsv(
      Buffer.from('nip,"Gaji Pokok",loanInstallment\nAO-001,"10,000,000",500000\n'),
    );
    expect(rows[0]).toEqual(['nip', 'Gaji Pokok', 'loanInstallment']);
    expect(rows[1]).toEqual(['AO-001', '10,000,000', '500000']);
  });
});

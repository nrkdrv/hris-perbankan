import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PayrollResult } from '@hris/shared';

export interface PayslipPdfInput {
  fullName: string;
  nip: string;
  jobTitle?: string | null;
  branchName?: string | null;
  periodMonth: string; // 'YYYY-MM'
  result: PayrollResult;
}

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n));

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function periodLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-');
  const idx = Number(m) - 1;
  return `${MONTHS_ID[idx] ?? m} ${y}`;
}

/** Generate PDF slip gaji satu karyawan (sebelum enkripsi AES-256-GCM). */
export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  const right = 595 - margin;
  let y = 806;

  const text = (t: string, x: number, yy: number, opts?: { bold?: boolean; size?: number }) => {
    page.drawText(t, { x, y: yy, size: opts?.size ?? 10.5, font: opts?.bold ? bold : font });
  };
  const line = (t: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    text(t, margin, y, opts);
    y -= opts?.gap ?? 19;
  };
  const row = (label: string, value: string, opts?: { bold?: boolean }) => {
    text(label, margin, y, opts);
    const vw = font.widthOfTextAtSize(value, 10.5);
    text(value, right - vw, y, opts);
    y -= 18;
  };
  const rule = () => {
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.8 });
    y -= 14;
  };

  line('SLIP GAJI KARYAWAN', { bold: true, size: 15, gap: 26 });
  line(`Periode: ${periodLabel(input.periodMonth)}`, { gap: 16 });
  line(`Nama: ${input.fullName}`, { gap: 16 });
  line(`NIP: ${input.nip}${input.jobTitle ? `   |   ${input.jobTitle}` : ''}${input.branchName ? `   |   ${input.branchName}` : ''}`, { gap: 22 });

  const r = input.result;
  line('PENERIMAAN', { bold: true, gap: 20 });
  for (const [name, amount] of Object.entries(r.earnings)) {
    row(`  ${name}`, rp(amount));
  }
  rule();
  row('Total Bruto', rp(r.grossPay), { bold: true });
  y -= 8;

  line('POTONGAN', { bold: true, gap: 20 });
  for (const [name, amount] of Object.entries(r.deductions)) {
    row(`  ${name}`, rp(amount));
  }
  rule();
  row('Total Potongan', rp(r.totalDeductions), { bold: true });
  y -= 10;
  rule();
  row('GAJI BERSIH DITERIMA', rp(r.netTakeHomePay), { bold: true });

  y -= 30;
  line(`Kategori TER: ${r.terCategory}  (tarif ${(r.terRate * 100).toFixed(2)}%)`, { size: 9, gap: 16 });
  line('Dokumen ini bersifat rahasia dan hanya diperuntukkan bagi karyawan yang bersangkutan.', { size: 9 });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

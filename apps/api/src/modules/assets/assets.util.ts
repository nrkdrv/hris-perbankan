import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Jumlah bulan penuh antara dua tanggal (dipakai untuk penyusutan). */
export function fullMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export interface DepreciationResult {
  monthlyDepreciation: number | null;
  bookValue: number | null;
}

/**
 * Penyusutan garis lurus per bulan.
 * Mengembalikan null bila data perolehan / masa manfaat tidak lengkap.
 */
export function computeDepreciation(
  acquisitionCost: number | null | undefined,
  usefulLifeMonths: number | null | undefined,
  acquisitionDate: Date | null | undefined,
  now: Date = new Date(),
): DepreciationResult {
  if (
    acquisitionCost == null ||
    usefulLifeMonths == null ||
    usefulLifeMonths <= 0 ||
    !Number.isFinite(acquisitionCost)
  ) {
    return { monthlyDepreciation: null, bookValue: null };
  }
  const monthly = acquisitionCost / usefulLifeMonths;
  const elapsed = acquisitionDate
    ? Math.min(fullMonthsBetween(new Date(acquisitionDate), now), usefulLifeMonths)
    : 0;
  const bookValue = Math.max(0, acquisitionCost - monthly * elapsed);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return { monthlyDepreciation: round2(monthly), bookValue: round2(bookValue) };
}

export interface BastPdfInput {
  assetCode: string;
  assetName: string;
  serialNumber?: string | null;
  branchName?: string | null;
  fromName?: string | null;
  fromNip?: string | null;
  toName: string;
  toNip: string;
  handoverDate: Date;
  notes?: string | null;
}

/** Generate PDF Berita Acara Serah Terima (BAST) aset. */
export async function buildBastPdf(input: BastPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 56;
  let y = 800;
  const line = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    page.drawText(text, {
      x: margin,
      y,
      size: opts?.size ?? 11,
      font: opts?.bold ? bold : font,
    });
    y -= opts?.gap ?? 20;
  };

  const fmtDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

  line('BERITA ACARA SERAH TERIMA ASET', { bold: true, size: 15, gap: 28 });
  line(`Kode Aset   : ${input.assetCode}`, { gap: 18 });
  line(`Nama Aset   : ${input.assetName}`, { gap: 18 });
  if (input.serialNumber) line(`No. Seri    : ${input.serialNumber}`, { gap: 18 });
  if (input.branchName) line(`Cabang      : ${input.branchName}`, { gap: 18 });
  line('', { gap: 8 });
  line('Pada tanggal ' + fmtDate(input.handoverDate) + ', telah diserahterimakan aset:', { gap: 24 });
  line(`Diserahkan oleh : ${input.fromName ?? '-'}${input.fromNip ? ` (${input.fromNip})` : ''}`, { gap: 18 });
  line(`Diterima oleh   : ${input.toName} (${input.toNip})`, { gap: 18 });
  if (input.notes) line(`Catatan         : ${input.notes}`, { gap: 18 });
  line('', { gap: 24 });
  line('Penerima bertanggung jawab penuh atas aset tersebut selama dalam penguasaannya.', { gap: 40 });

  // Blok tanda tangan
  const sigY = y;
  page.drawText('Yang Menyerahkan,', { x: margin, y: sigY, size: 11, font });
  page.drawText('Yang Menerima,', { x: 340, y: sigY, size: 11, font });
  page.drawText(`( ${input.fromName ?? '....................'} )`, { x: margin, y: sigY - 70, size: 11, font });
  page.drawText(`( ${input.toName} )`, { x: 340, y: sigY - 70, size: 11, font });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

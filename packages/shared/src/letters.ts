/**
 * Util penomoran dokumen murni (tanpa dependensi).
 * Format sesuai PRD: {nomor_urut_3_digit}/{kode_jenis_surat}/{kode_entitas_cabang}/{bulan_romawi}/{tahun}
 * Contoh: 042/SK-DIR/BPR-XYZ/X/2026
 */

const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI',
  'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
] as const;

export function toRomanMonth(month: number): string {
  if (month < 1 || month > 12) throw new Error(`Bulan tidak valid: ${month}`);
  return ROMAN_MONTHS[month - 1];
}

/** Kode kategori untuk tampilan (SK_DIR -> "SK-DIR"). */
export const LETTER_CATEGORY_DISPLAY: Record<string, string> = {
  SK_DIR: 'SK-DIR',
  ST: 'ST',
  SP: 'SP',
  MEMO: 'MEMO',
  EXT: 'EXT',
};

export function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

export function buildLetterNumber(
  seq: number,
  categoryCode: string,
  entityCode: string,
  date: Date = new Date(),
): string {
  const display = LETTER_CATEGORY_DISPLAY[categoryCode] ?? categoryCode;
  return `${pad3(seq)}/${display}/${entityCode}/${toRomanMonth(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Format kode inventaris: INV/{kategori}/{kode_kantor}/{tahun}/{urut_4_digit}
 * Contoh: INV/IT/KTR-PST/2026/0015
 */
export function buildAssetCode(
  categoryCode: string,
  branchCode: string,
  year: number,
  seq: number,
): string {
  return `INV/${categoryCode}/${branchCode}/${year}/${pad4(seq)}`;
}

/** Tambah N hari kerja (lewati Sabtu/Minggu). */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

/** Hitung hari kerja (Senin-Jumat) di rentang tanggal inklusif, dikurangi tanggal libur. */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidays: Set<string>, // 'YYYY-MM-DD'
): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d <= last) {
    const day = d.getDay();
    const key = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidays.has(key)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

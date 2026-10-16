/**
 * Guardrail kuota Teller/CS cabang (pure function, tanpa DB).
 * Dipakai saat pengajuan & persetujuan cuti: menghitung sisa staf
 * aktif per tanggal dan menyusun peringatan bila di bawah minimum.
 */

export interface QuotaStaff {
  id: string;
  jobTitle: string | null;
}

export interface LeaveSpan {
  userId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

export interface QuotaBranch {
  minTellerQuota: number;
  minCsQuota: number;
}

export interface QuotaWarning {
  date: string;
  role: 'TELLER' | 'CS';
  remaining: number;
  minimum: number;
}

const TELLER_RE = /teller/i;
const CS_RE = /customer service|\bcs\b/i;

export function isTeller(jobTitle: string | null | undefined): boolean {
  return !!jobTitle && TELLER_RE.test(jobTitle);
}

export function isCs(jobTitle: string | null | undefined): boolean {
  return !!jobTitle && CS_RE.test(jobTitle);
}

/** Daftar 'YYYY-MM-DD' dari start s/d end inklusif. */
export function eachDateKey(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startDate}T00:00:00.000Z`);
  const last = new Date(`${endDate}T00:00:00.000Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function isWeekendKey(dateKey: string): boolean {
  const wd = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

export interface BuildQuotaParams {
  requesterId: string;
  requesterJobTitle: string | null | undefined;
  branch: QuotaBranch;
  startDate: string;
  endDate: string;
  holidays: Set<string>; // 'YYYY-MM-DD'
  staff: QuotaStaff[]; // staf aktif cabang
  approvedLeaves: LeaveSpan[]; // cuti APPROVED yang overlap rentang
}

/**
 * Hitung peringatan kuota per tanggal kerja dalam rentang cuti.
 * Mengasumsikan cuti requester ikut disetujui (ikut mengurangi sisa).
 * Kuota hanya dihitung pada hari kerja (lewati weekend & libur).
 */
export function buildQuotaWarnings(p: BuildQuotaParams): QuotaWarning[] {
  const titleByUser = new Map(p.staff.map((s) => [s.id, s.jobTitle]));
  const tellerIds = new Set(
    p.staff.filter((s) => isTeller(s.jobTitle)).map((s) => s.id),
  );
  const csIds = new Set(p.staff.filter((s) => isCs(s.jobTitle)).map((s) => s.id));

  const requesterIsTeller = isTeller(p.requesterJobTitle);
  const requesterIsCs = isCs(p.requesterJobTitle);

  const warnings: QuotaWarning[] = [];
  for (const date of eachDateKey(p.startDate, p.endDate)) {
    if (isWeekendKey(date) || p.holidays.has(date)) continue;

    const onLeaveTeller = new Set<string>();
    const onLeaveCs = new Set<string>();
    for (const lv of p.approvedLeaves) {
      if (lv.startDate <= date && date <= lv.endDate) {
        if (tellerIds.has(lv.userId)) onLeaveTeller.add(lv.userId);
        if (csIds.has(lv.userId)) onLeaveCs.add(lv.userId);
      }
    }
    // Asumsikan cuti yang diajukan ikut disetujui.
    if (requesterIsTeller && tellerIds.has(p.requesterId)) {
      onLeaveTeller.add(p.requesterId);
    }
    if (requesterIsCs && csIds.has(p.requesterId)) {
      onLeaveCs.add(p.requesterId);
    }

    const tellerRemaining = tellerIds.size - onLeaveTeller.size;
    if (tellerIds.size > 0 && tellerRemaining < p.branch.minTellerQuota) {
      warnings.push({
        date,
        role: 'TELLER',
        remaining: tellerRemaining,
        minimum: p.branch.minTellerQuota,
      });
    }
    const csRemaining = csIds.size - onLeaveCs.size;
    if (csIds.size > 0 && csRemaining < p.branch.minCsQuota) {
      warnings.push({
        date,
        role: 'CS',
        remaining: csRemaining,
        minimum: p.branch.minCsQuota,
      });
    }
    void titleByUser;
  }
  return warnings;
}

/** Format peringatan menjadi teks multi-baris untuk kolom quotaWarning. */
export function formatQuotaWarning(warnings: QuotaWarning[]): string | null {
  if (warnings.length === 0) return null;
  return warnings
    .map(
      (w) =>
        `${w.date}: kuota ${w.role === 'TELLER' ? 'Teller' : 'CS'} tersisa ${w.remaining} dari minimum ${w.minimum} orang`,
    )
    .join('\n');
}

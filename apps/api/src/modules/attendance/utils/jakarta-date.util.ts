/** Helper tanggal berbasis zona Asia/Jakarta (WIB). */

const TZ = 'Asia/Jakarta';

function parts(date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/** Kunci tanggal 'YYYY-MM-DD' menurut WIB. */
export function jakartaDateKey(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Jam 'HH:mm' menurut WIB. */
export function jakartaTimeHHmm(date: Date = new Date()): string {
  const p = parts(date);
  const h = p.hour === '24' ? '00' : p.hour;
  return `${h}:${p.minute}`;
}

/** True jika hari menurut WIB adalah Sabtu/Minggu. */
export function isWeekendJakarta(date: Date = new Date()): boolean {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(date);
  return wd === 'Sat' || wd === 'Sun';
}

/**
 * 'YYYY-MM-DD' -> Date UTC tengah malam (cocok untuk kolom @db.Date).
 * Prisma/Postgres membandingkan porsi tanggalnya saja.
 */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** 'HH:mm' -> menit sejak tengah malam. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Hitung keterlambatan (menit) clock-in terhadap jam mulai kerja cabang.
 * > 0 berarti terlambat.
 */
export function computeLateMinutes(
  clockInAt: Date,
  workStartTime: string,
): number {
  const diff =
    hhmmToMinutes(jakartaTimeHHmm(clockInAt)) - hhmmToMinutes(workStartTime);
  return diff > 0 ? diff : 0;
}

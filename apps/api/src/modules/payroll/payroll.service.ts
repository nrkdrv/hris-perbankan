import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { calculatePayroll, PayrollResult } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { FcmService } from '../../common/services/fcm.service';
import { decryptAes256Gcm, encryptAes256Gcm } from '../core/crypto.util';
import { notifySafe } from '../core/notify.util';
import { requestUser } from '../core/request-user';
import { buildPayslipPdf } from './payroll-pdf';
import { ImportBatchError, ImportBatchResultRow, PayrollRowDto } from './dto';

const LATE_FINE_KEY = 'lateFinePerMinute';
const DEFAULT_LATE_FINE = 5000;
const BIRTH_FALLBACK = '01011990';

/** Parse angka rupiah toleran format Indonesia (Rp 1.250.000 / 1,250,000.50). */
export function parseRupiah(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  let s = String(raw).trim().replace(/[^0-9,.\-]/g, '');
  if (s === '' || s === '-' || s === '.' || s === ',') return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Dua format mungkin: ID "1.250.000,50" vs US "1,250,000.50".
    // Separator desimal = separator terakhir bila diikuti 1-2 digit.
    if (/,\d{1,2}$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.'); // ID → 1250000.50
    } else {
      s = s.replace(/,/g, ''); // US → 1250000.50
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    // hanya titik: bedakan pemisah ribuan ID (1.250.000) vs desimal (1250.50)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parser CSV minimal yang paham tanda kutip. */
export function parseCsv(buffer: Buffer): string[][] {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c === '\r') {
      // abaikan
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function ddMMyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`;
}

/** Password PDF: DDMMYYYY tanggal lahir + 4 digit terakhir NIP. */
export function payslipPassword(birthDate: Date | null | undefined, nip: string): string {
  const dob = birthDate ? ddMMyyyy(new Date(birthDate)) : BIRTH_FALLBACK;
  return `${dob}${nip.slice(-4)}`;
}

interface UserLite {
  id: string;
  nip: string;
  fullName: string;
  ptkpStatus: string;
  birthDate: Date | null;
  jobTitle: string | null;
  branchId: string;
}

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly fcm: FcmService,
  ) {}

  private async getLateFinePerMinute(): Promise<number> {
    const s = await this.prisma.systemSetting.findUnique({ where: { key: LATE_FINE_KEY } });
    const n = s ? parseInt(s.value, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LATE_FINE;
  }

  private monthRange(periodMonth: string): { start: Date; end: Date } {
    const [y, m] = periodMonth.split('-').map(Number);
    return {
      start: new Date(y, m - 1, 1),
      end: new Date(y, m, 1),
    };
  }

  private async computeRow(
    user: UserLite,
    periodMonth: string,
    earnings: Record<string, number>,
    loanInstallment: number,
  ): Promise<{ lateMinutes: number; result: PayrollResult }> {
    const { start, end } = this.monthRange(periodMonth);
    const agg = await this.prisma.attendanceLog.aggregate({
      _sum: { lateMinutes: true },
      where: { userId: user.id, attendanceDate: { gte: start, lt: end } },
    });
    const lateMinutes = agg._sum.lateMinutes ?? 0;
    const result = calculatePayroll({
      earnings,
      ptkpStatus: user.ptkpStatus,
      presentDays: 0,
      lateMinutes,
      lateFinePerMinute: await this.getLateFinePerMinute(),
      loanInstallment,
    });
    return { lateMinutes, result };
  }

  // ---------- Import batch ----------

  /**
   * Parse file CSV/XLSX template payroll.
   * Kolom: nip | <kolom earning bebas> | loanInstallment (opsional).
   * Tidak menulis DB — hanya validasi & normalisasi.
   */
  async importBatch(file: Express.Multer.File, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    if (!file) throw new BadRequestException('File wajib diunggah (field: file)');

    let headers: string[];
    let dataRows: (string | number | null)[][];
    if (/\.xlsx$/i.test(file.originalname) || file.mimetype.includes('spreadsheet')) {
      ({ headers, dataRows } = await this.readXlsx(file.buffer));
    } else {
      const table = parseCsv(file.buffer);
      headers = table[0] ?? [];
      dataRows = table.slice(1);
    }
    if (headers.length === 0) {
      throw new BadRequestException('File kosong atau tanpa header');
    }

    const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, '');
    const nipIdx = headers.findIndex((h) => norm(h) === 'nip');
    if (nipIdx < 0) throw new BadRequestException('Kolom "nip" wajib ada pada file');
    const loanIdx = headers.findIndex((h) =>
      ['loaninstallment', 'angsuran', 'angsuranpinjaman', 'pinjaman', 'koperasi'].includes(norm(h)),
    );
    const earningIdxs = headers
      .map((_, i) => i)
      .filter((i) => i !== nipIdx && i !== loanIdx && headers[i].trim() !== '');

    const nips = new Set<string>();
    for (const r of dataRows) {
      const nip = String(r[nipIdx] ?? '').trim();
      if (nip) nips.add(nip);
    }
    const rawUsers = (await this.prisma.user.findMany({
      where: { nip: { in: [...nips] } },
    })) as Array<{ id: string; nip: string; fullName: string }>;
    const byNip = new Map(rawUsers.map((u) => [u.nip, u] as const));

    const rows: ImportBatchResultRow[] = [];
    const errors: ImportBatchError[] = [];

    dataRows.forEach((r, i) => {
      const rowNo = i + 2; // 1-based + header
      const nip = String(r[nipIdx] ?? '').trim();
      if (!nip) return; // baris kosong
      const user = byNip.get(nip);
      if (!user) {
        errors.push({ row: rowNo, nip, message: 'NIP tidak terdaftar di sistem' });
        return;
      }
      const earnings: Record<string, number> = {};
      for (const idx of earningIdxs) {
        const raw = r[idx];
        if (raw == null || String(raw).trim() === '') continue;
        const val = parseRupiah(raw);
        if (val == null) {
          errors.push({
            row: rowNo,
            nip,
            message: `Kolom "${headers[idx]}" bukan angka valid: ${String(raw)}`,
          });
          return;
        }
        earnings[headers[idx].trim()] = val;
      }
      let loanInstallment = 0;
      if (loanIdx >= 0) {
        const raw = r[loanIdx];
        if (raw != null && String(raw).trim() !== '') {
          const val = parseRupiah(raw);
          if (val == null) {
            errors.push({ row: rowNo, nip, message: `Kolom loanInstallment bukan angka valid` });
            return;
          }
          loanInstallment = val;
        }
      }
      rows.push({ userId: user.id, nip, fullName: user.fullName, earnings, loanInstallment });
    });

    await this.audit.log(actor.id, 'PAYROLL_IMPORT', 'PayrollPeriod', 'batch', {
      newValues: { rows: rows.length, errors: errors.length, fileName: file.originalname },
    });
    return { rows, errors };
  }

  private async readXlsx(
    buffer: Buffer,
  ): Promise<{ headers: string[]; dataRows: (string | number | null)[][] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Workbook tidak memiliki worksheet');
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cell.text?.trim() ?? '';
    });
    const dataRows: (string | number | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const vals: (string | number | null)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        vals[col - 1] = typeof v === 'number' ? v : v == null ? null : cell.text;
      });
      if (vals.some((v) => v != null && String(v).trim() !== '')) dataRows.push(vals);
    });
    return { headers, dataRows };
  }

  // ---------- Simulate ----------

  /** Pratinjau kalkulasi tanpa menulis DB. */
  async simulate(periodMonth: string, rows: PayrollRowDto[]) {
    const results: Array<{
      userId: string;
      nip: string;
      fullName: string;
      lateMinutes: number;
      result: PayrollResult;
    }> = [];
    for (const row of rows) {
      const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
      if (!user) throw new NotFoundException(`User ${row.userId} tidak ditemukan`);
      const { lateMinutes, result } = await this.computeRow(
        user as unknown as UserLite,
        periodMonth,
        row.earnings,
        row.loanInstallment ?? 0,
      );
      results.push({ userId: user.id, nip: user.nip, fullName: user.fullName, lateMinutes, result });
    }
    return { periodMonth, results };
  }

  // ---------- Publish ----------

  /**
   * Publish periode: hitung ulang tiap baris → upsert Payslip (isPublished)
   * → generate PDF → enkripsi AES-256-GCM → simpan .enc → tandai PUBLISHED.
   */
  async publishPeriod(periodMonth: string, rows: PayrollRowDto[], actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) {
      throw new UnprocessableEntityException('periodMonth harus berformat YYYY-MM');
    }
    if (rows.length === 0) {
      throw new BadRequestException('rows tidak boleh kosong');
    }

    // Default denda keterlambatan bila setting belum ada.
    await this.prisma.systemSetting.upsert({
      where: { key: LATE_FINE_KEY },
      update: {},
      create: { key: LATE_FINE_KEY, value: String(DEFAULT_LATE_FINE) },
    });

    await this.prisma.payrollPeriod.upsert({
      where: { periodMonth },
      update: {},
      create: { periodMonth, status: 'DRAFT' },
    });

    let count = 0;
    for (const row of rows) {
      const user = await this.prisma.user.findUnique({
        where: { id: row.userId },
        include: { branch: { select: { name: true } } },
      });
      if (!user) throw new NotFoundException(`User ${row.userId} tidak ditemukan`);

      const { result } = await this.computeRow(
        user as unknown as UserLite,
        periodMonth,
        row.earnings,
        row.loanInstallment ?? 0,
      );

      const pdf = await buildPayslipPdf({
        fullName: user.fullName,
        nip: user.nip,
        jobTitle: user.jobTitle,
        branchName: user.branch?.name,
        periodMonth,
        result,
      });
      const password = payslipPassword(user.birthDate, user.nip);
      const enc = encryptAes256Gcm(pdf, password);
      const key = `payroll/${periodMonth}/${user.id}.enc`;
      const url = await this.storage.save(enc, key, 'application/octet-stream');

      const now = new Date();
      await this.prisma.payslip.upsert({
        where: { userId_periodMonth: { userId: user.id, periodMonth } },
        update: {
          earningsJson: result.earnings,
          deductionsJson: result.deductions,
          grossPay: result.grossPay,
          pph21Amount: result.pph21,
          netTakeHomePay: result.netTakeHomePay,
          encryptedPdfUrl: url,
          isPublished: true,
          publishedAt: now,
        },
        create: {
          userId: user.id,
          periodMonth,
          earningsJson: result.earnings,
          deductionsJson: result.deductions,
          grossPay: result.grossPay,
          pph21Amount: result.pph21,
          netTakeHomePay: result.netTakeHomePay,
          encryptedPdfUrl: url,
          isPublished: true,
          publishedAt: now,
        },
      });
      count++;

      await notifySafe(
        this.fcm,
        user.id,
        'Slip gaji tersedia',
        `Slip gaji periode ${periodMonth} sudah diterbitkan. Unduh di aplikasi.`,
        { periodMonth },
      );
    }

    await this.prisma.payrollPeriod.update({
      where: { periodMonth },
      data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: actor.id },
    });
    await this.audit.log(actor.id, 'PAYROLL_PUBLISH', 'PayrollPeriod', periodMonth, {
      newValues: { periodMonth, count },
    });
    return { periodMonth, count };
  }

  // ---------- Read ----------

  /** Slip gaji milik sendiri (hanya yang sudah dipublish). */
  async myPayslips(actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const slips = (await this.prisma.payslip.findMany({
      where: { userId: actor.id, isPublished: true },
      orderBy: { periodMonth: 'desc' },
    })) as Array<{
      id: string;
      userId: string;
      periodMonth: string;
      earningsJson: unknown;
      deductionsJson: unknown;
      grossPay: unknown;
      pph21Amount: unknown;
      netTakeHomePay: unknown;
      encryptedPdfUrl: string | null;
      isPublished: boolean;
      publishedAt: Date | null;
    }>;
    return slips.map((s) => this.toDto(s));
  }

  async periods() {
    return this.prisma.payrollPeriod.findMany({
      orderBy: { periodMonth: 'desc' },
      include: { _count: { select: { payslips: true } } },
    });
  }

  /**
   * Unduh PDF slip gaji: pemilik ATAU SUPER_ADMIN.
   * Akses ilegal → 403 + dicatat sebagai IDOR_ATTEMPT di SecurityFraudLog.
   */
  async downloadPdf(
    id: string,
    actorRaw: unknown,
    ip?: string,
  ): Promise<{ buffer: Buffer; periodMonth: string }> {
    const actor = requestUser(actorRaw);
    const slip = await this.prisma.payslip.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!slip) throw new NotFoundException('Slip gaji tidak ditemukan');

    const isOwner = slip.userId === actor.id;
    const isSuperAdmin = actor.role === 'SUPER_ADMIN';
    if (!isOwner && !isSuperAdmin) {
      await this.prisma.securityFraudLog.create({
        data: {
          userId: actor.id,
          incidentType: 'IDOR_ATTEMPT',
          details: {
            entityType: 'Payslip',
            entityId: id,
            ownerUserId: slip.userId,
            attemptedAt: new Date().toISOString(),
          },
          ipAddress: ip,
        },
      });
      throw new ForbiddenException('Akses ditolak: slip gaji bukan milik Anda');
    }

    const key = `payroll/${slip.periodMonth}/${slip.userId}.enc`;
    const enc = await this.storage.getBuffer(key);
    const password = payslipPassword(slip.user.birthDate, slip.user.nip);
    let pdf: Buffer;
    try {
      pdf = decryptAes256Gcm(Buffer.from(enc), password);
    } catch {
      this.logger.error(`Gagal mendekripsi slip ${id}`);
      throw new BadRequestException('Berkas slip gaji tidak dapat didekripsi');
    }
    return { buffer: pdf, periodMonth: slip.periodMonth };
  }

  private toDto(s: {
    id: string;
    userId: string;
    periodMonth: string;
    earningsJson: unknown;
    deductionsJson: unknown;
    grossPay: unknown;
    pph21Amount: unknown;
    netTakeHomePay: unknown;
    encryptedPdfUrl: string | null;
    isPublished: boolean;
    publishedAt: Date | null;
  }) {
    return {
      id: s.id,
      userId: s.userId,
      periodMonth: s.periodMonth,
      earnings: s.earningsJson,
      deductions: s.deductionsJson,
      grossPay: Number(s.grossPay),
      pph21Amount: Number(s.pph21Amount),
      netTakeHomePay: Number(s.netTakeHomePay),
      encryptedPdfUrl: s.encryptedPdfUrl,
      isPublished: s.isPublished,
      publishedAt: s.publishedAt,
    };
  }
}

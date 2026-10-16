import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, HolidayType, LeaveType } from '@prisma/client';
import { Role, countWorkingDays } from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { FcmService } from '../../common/services/fcm.service';
import { jakartaDateKey, parseDateKey } from '../attendance/utils/jakarta-date.util';
import {
  buildQuotaWarnings,
  eachDateKey,
  formatQuotaWarning,
  LeaveSpan,
} from './utils/quota.util';
import {
  CreateEventDto,
  CreateHolidayDto,
  CreateLeaveDto,
  EventsQueryDto,
  LeaveDecisionDto,
  UnifiedQueryDto,
} from './dto/calendar.dto';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fcm: FcmService,
  ) {}

  // ================= HARI LIBUR =================

  async listHolidays(year: number) {
    const rows: any[] = await this.prisma.companyHoliday.findMany({
      where: { year },
      orderBy: { holidayDate: 'asc' },
    });
    return rows.map((h) => ({
      id: h.id,
      holidayDate: jakartaDateKey(h.holidayDate),
      name: h.name,
      type: h.type,
      year: h.year,
    }));
  }

  async createHoliday(user: AuthUser, dto: CreateHolidayDto, ip?: string) {
    const date = parseDateKey(dto.holidayDate);
    const exists = await this.prisma.companyHoliday.findUnique({
      where: { holidayDate: date },
    });
    if (exists) {
      throw new ConflictException('Tanggal tersebut sudah terdaftar sebagai hari libur.');
    }
    const h = await this.prisma.companyHoliday.create({
      data: {
        holidayDate: date,
        name: dto.name,
        // Nilai string identik dengan enum Prisma; cast via unknown (TS2352).
        type: dto.type as unknown as HolidayType,
        year: date.getUTCFullYear(),
      },
    });
    await this.audit.log(user.id, 'HOLIDAY_CREATE', 'CompanyHoliday', h.id, {
      newValues: { holidayDate: dto.holidayDate, name: dto.name },
      ip,
    });
    return { id: h.id, holidayDate: dto.holidayDate, name: h.name, type: h.type };
  }

  async deleteHoliday(user: AuthUser, id: string, ip?: string) {
    const h = await this.prisma.companyHoliday.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('Hari libur tidak ditemukan.');
    await this.prisma.companyHoliday.delete({ where: { id } });
    await this.audit.log(user.id, 'HOLIDAY_DELETE', 'CompanyHoliday', id, {
      oldValues: { holidayDate: jakartaDateKey(h.holidayDate), name: h.name },
      ip,
    });
    return { deleted: true, id };
  }

  // ================= CUTI =================

  async createLeave(user: AuthUser, dto: CreateLeaveDto, ip?: string) {
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException('startDate tidak boleh setelah endDate.');
    }
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { branch: true },
    });
    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException('Akun tidak aktif.');
    }

    const holidays = await this.holidaySet(dto.startDate, dto.endDate);
    const workingDaysCount = countWorkingDays(
      parseDateKey(dto.startDate),
      parseDateKey(dto.endDate),
      holidays,
    );
    if (workingDaysCount <= 0) {
      throw new BadRequestException(
        'Rentang tanggal tidak memuat hari kerja (weekend/libur semua).',
      );
    }

    const quotaWarning = await this.computeQuotaWarning({
      requesterId: user.id,
      requesterJobTitle: dbUser.jobTitle,
      branchId: dbUser.branchId,
      minTellerQuota: dbUser.branch.minTellerQuota,
      minCsQuota: dbUser.branch.minCsQuota,
      startDate: dto.startDate,
      endDate: dto.endDate,
      holidays,
    });

    const leave = await this.prisma.leaveRequest.create({
      data: {
        userId: user.id,
        leaveType: dto.leaveType as unknown as LeaveType,
        startDate: parseDateKey(dto.startDate),
        endDate: parseDateKey(dto.endDate),
        workingDaysCount,
        reason: dto.reason ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
        quotaWarning,
      },
    });

    await this.audit.log(user.id, 'LEAVE_CREATE', 'LeaveRequest', leave.id, {
      newValues: {
        leaveType: dto.leaveType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        workingDaysCount,
        quotaWarning,
      },
      ip,
    });

    return {
      id: leave.id,
      leaveType: leave.leaveType,
      startDate: dto.startDate,
      endDate: dto.endDate,
      workingDaysCount,
      approvalStatus: leave.approvalStatus,
      quotaWarning,
    };
  }

  async myLeaves(user: AuthUser) {
    const rows: any[] = await this.prisma.leaveRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((l) => this.leaveDto(l));
  }

  async pendingApprovals(user: AuthUser) {
    const rows: any[] = await this.prisma.leaveRequest.findMany({
      where: {
        approvalStatus: ApprovalStatus.PENDING,
        ...(user.role === Role.BRANCH_MANAGER
          ? { user: { branchId: user.branchId } }
          : {}),
      },
      include: {
        user: {
          select: {
            nip: true,
            fullName: true,
            jobTitle: true,
            branch: { select: { branchCode: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((l) => ({ ...this.leaveDto(l), user: l.user }));
  }

  async decide(
    user: AuthUser,
    id: string,
    dto: LeaveDecisionDto,
    ip?: string,
  ) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { select: { branchId: true, jobTitle: true } } },
    });
    if (!leave) throw new NotFoundException('Pengajuan cuti tidak ditemukan.');
    if (
      user.role === Role.BRANCH_MANAGER &&
      leave.user.branchId !== user.branchId
    ) {
      throw new ForbiddenException('Pengajuan di luar cabang Anda.');
    }
    if (leave.approvalStatus !== ApprovalStatus.PENDING) {
      throw new ConflictException(
        `Pengajuan sudah berstatus ${leave.approvalStatus}.`,
      );
    }

    // Hitung ulang guardrail kuota tepat saat approve.
    let quotaWarning = leave.quotaWarning;
    if (dto.decision === 'APPROVED') {
      const holidays = await this.holidaySet(
        jakartaDateKey(leave.startDate),
        jakartaDateKey(leave.endDate),
      );
      const branch = await this.prisma.branch.findUnique({
        where: { id: leave.user.branchId },
        select: { minTellerQuota: true, minCsQuota: true },
      });
      quotaWarning = await this.computeQuotaWarning({
        requesterId: leave.userId,
        requesterJobTitle: leave.user.jobTitle,
        branchId: leave.user.branchId,
        minTellerQuota: branch?.minTellerQuota ?? 2,
        minCsQuota: branch?.minCsQuota ?? 1,
        startDate: jakartaDateKey(leave.startDate),
        endDate: jakartaDateKey(leave.endDate),
        holidays,
      });
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        approvalStatus: dto.decision as unknown as ApprovalStatus,
        approvedBy: user.id,
        approvedAt: new Date(),
        approverNotes: dto.notes ?? null,
        quotaWarning,
      },
    });

    await this.audit.log(user.id, 'LEAVE_DECISION', 'LeaveRequest', id, {
      oldValues: { approvalStatus: 'PENDING' },
      newValues: {
        approvalStatus: dto.decision,
        notes: dto.notes ?? null,
        quotaWarning,
      },
      ip,
    });

    // Notifikasi ke pemohon (best-effort).
    try {
      await this.fcm.notifyUser(
        leave.userId,
        dto.decision === 'APPROVED'
          ? 'Pengajuan cuti disetujui'
          : 'Pengajuan cuti ditolak',
        `${jakartaDateKey(leave.startDate)} s/d ${jakartaDateKey(leave.endDate)}${dto.notes ? ` — ${dto.notes}` : ''}`,
        { leaveId: id, decision: dto.decision },
      );
    } catch {
      /* notifikasi gagal: keputusan tetap sah */
    }

    return { ...this.leaveDto(updated), quotaWarning };
  }

  // ================= KALENDER TERPADU =================

  async unified(user: AuthUser, q: UnifiedQueryDto) {
    const { start, end } = this.monthRange(q.month);
    const branchId =
      user.role === Role.BRANCH_MANAGER ? user.branchId : q.branchId;

    const [leaves, holidays, users, events]: any[][] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          approvalStatus: ApprovalStatus.APPROVED,
          startDate: { lt: end },
          endDate: { gte: start },
          ...(branchId ? { user: { branchId } } : {}),
        },
        include: {
          user: {
            select: {
              nip: true,
              fullName: true,
              jobTitle: true,
              branch: { select: { branchCode: true, name: true } },
            },
          },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.companyHoliday.findMany({
        where: { holidayDate: { gte: start, lt: end } },
        orderBy: { holidayDate: 'asc' },
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          birthDate: { not: null },
          ...(branchId ? { branchId } : {}),
        },
        select: {
          id: true,
          nip: true,
          fullName: true,
          birthDate: true,
          branch: { select: { branchCode: true, name: true } },
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          startAt: { gte: start, lt: end },
          ...(branchId
            ? { OR: [{ branchId }, { branchId: null }] }
            : {}),
        },
        include: {
          branch: { select: { branchCode: true, name: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const monthIdx = Number(q.month.split('-')[1]);
    const birthdays = users
      .filter((u) => u.birthDate && u.birthDate.getUTCMonth() + 1 === monthIdx)
      .map((u) => ({
        userId: u.id,
        nip: u.nip,
        fullName: u.fullName,
        birthDate: u.birthDate!.toISOString().slice(5, 10), // 'MM-DD'
        branch: u.branch,
      }));

    return {
      leaves: leaves.map((l) => ({
        ...this.leaveDto(l),
        user: l.user,
        dates: eachDateKey(
          jakartaDateKey(l.startDate),
          jakartaDateKey(l.endDate),
        ),
      })),
      holidays: holidays.map((h) => ({
        id: h.id,
        holidayDate: jakartaDateKey(h.holidayDate),
        name: h.name,
        type: h.type,
      })),
      birthdays,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt?.toISOString() ?? null,
        branch: e.branch,
      })),
    };
  }

  // ================= EVENT MANAJEMEN =================

  async createEvent(user: AuthUser, dto: CreateEventDto, ip?: string) {
    if (
      user.role === Role.BRANCH_MANAGER &&
      dto.branchId &&
      dto.branchId !== user.branchId
    ) {
      throw new ForbiddenException('Event di luar cabang Anda.');
    }
    const e = await this.prisma.calendarEvent.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
        branchId:
          dto.branchId ??
          (user.role === Role.BRANCH_MANAGER ? user.branchId : null),
        createdBy: user.id,
      },
    });
    await this.audit.log(user.id, 'CALENDAR_EVENT_CREATE', 'CalendarEvent', e.id, {
      newValues: { title: dto.title, startAt: dto.startAt },
      ip,
    });
    return {
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
    };
  }

  async listEvents(user: AuthUser, q: EventsQueryDto) {
    const branchId =
      user.role === Role.BRANCH_MANAGER ? user.branchId : q.branchId;
    const where: Record<string, unknown> = {};
    if (q.month) {
      const { start, end } = this.monthRange(q.month);
      where.startAt = { gte: start, lt: end };
    }
    if (branchId) where.OR = [{ branchId }, { branchId: null }];
    const rows: any[] = await this.prisma.calendarEvent.findMany({
      where,
      include: { branch: { select: { branchCode: true, name: true } } },
      orderBy: { startAt: 'asc' },
      take: 500,
    });
    return rows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt?.toISOString() ?? null,
      branch: e.branch,
    }));
  }

  // ================= helper privat =================

  /** Set 'YYYY-MM-DD' hari libur dalam rentang. */
  private async holidaySet(
    startDate: string,
    endDate: string,
  ): Promise<Set<string>> {
    const years = new Set([
      Number(startDate.slice(0, 4)),
      Number(endDate.slice(0, 4)),
    ]);
    const rows: any[] = await this.prisma.companyHoliday.findMany({
      where: { year: { in: [...years] } },
      select: { holidayDate: true },
    });
    return new Set(rows.map((r) => jakartaDateKey(r.holidayDate)));
  }

  private async computeQuotaWarning(params: {
    requesterId: string;
    requesterJobTitle: string | null | undefined;
    branchId: string;
    minTellerQuota: number;
    minCsQuota: number;
    startDate: string;
    endDate: string;
    holidays: Set<string>;
  }): Promise<string | null> {
    const staff: any[] = await this.prisma.user.findMany({
      where: { isActive: true, branchId: params.branchId },
      select: { id: true, jobTitle: true },
    });
    const approved: any[] = await this.prisma.leaveRequest.findMany({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        userId: { in: staff.map((s) => s.id) },
        startDate: { lte: parseDateKey(params.endDate) },
        endDate: { gte: parseDateKey(params.startDate) },
      },
      select: { userId: true, startDate: true, endDate: true },
    });
    const spans: LeaveSpan[] = approved.map((l) => ({
      userId: l.userId,
      startDate: jakartaDateKey(l.startDate),
      endDate: jakartaDateKey(l.endDate),
    }));
    const warnings = buildQuotaWarnings({
      requesterId: params.requesterId,
      requesterJobTitle: params.requesterJobTitle,
      branch: {
        minTellerQuota: params.minTellerQuota,
        minCsQuota: params.minCsQuota,
      },
      startDate: params.startDate,
      endDate: params.endDate,
      holidays: params.holidays,
      staff,
      approvedLeaves: spans,
    });
    return formatQuotaWarning(warnings);
  }

  private monthRange(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, 1)),
      end: new Date(Date.UTC(y, m, 1)),
    };
  }

  private leaveDto(l: {
    id: string;
    leaveType: unknown;
    startDate: Date;
    endDate: Date;
    workingDaysCount: number;
    reason: string | null;
    attachmentUrl: string | null;
    approvalStatus: unknown;
    approvedAt: Date | null;
    approverNotes: string | null;
    quotaWarning: string | null;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      leaveType: l.leaveType,
      startDate: jakartaDateKey(l.startDate),
      endDate: jakartaDateKey(l.endDate),
      workingDaysCount: l.workingDaysCount,
      reason: l.reason,
      attachmentUrl: l.attachmentUrl,
      approvalStatus: l.approvalStatus,
      approvedAt: l.approvedAt?.toISOString() ?? null,
      approverNotes: l.approverNotes,
      quotaWarning: l.quotaWarning,
      createdAt: l.createdAt.toISOString(),
    };
  }
}

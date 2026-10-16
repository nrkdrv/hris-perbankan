import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { AttendanceStatus, LocationStatus, Prisma } from '@prisma/client';
import {
  MAX_CLOCK_SKEW_SEC,
  MAX_GPS_ACCURACY_M,
  Role,
  WorkLocationType,
  checkGeofence,
  haversineMeters,
  isImpossibleTravel,
} from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { ClockInDto, ClockLocationDto, ClockOutDto } from './dto/clock.dto';
import { hmac8, watermarkPayload } from './utils/watermark.util';
import {
  computeLateMinutes,
  isWeekendJakarta,
  jakartaDateKey,
  parseDateKey,
} from './utils/jakarta-date.util';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------
  // Watermark token: waktu server bertanda tangan untuk overlay
  // watermark di canvas klien.
  // ---------------------------------------------------------------
  watermarkToken(user: AuthUser) {
    const serverTime = new Date().toISOString();
    return {
      serverTime,
      hmac: hmac8(watermarkPayload(user.id, serverTime)),
    };
  }

  // ---------------------------------------------------------------
  // CLOCK-IN — urutan validasi sesuai PRD Modul 1 (defense-in-depth)
  // ---------------------------------------------------------------
  async clockIn(
    user: AuthUser,
    dto: ClockInDto,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Foto selfie clock-in wajib diunggah.');
    }
    const now = new Date();
    const dateKey = jakartaDateKey(now);

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { branch: true },
    });
    if (!dbUser || !dbUser.isActive) {
      throw new ForbiddenException('Akun tidak aktif.');
    }
    const branch = dbUser.branch;

    // (1) Mock location dari plugin native APK.
    if (dto.isMockDetected) {
      await this.logFraud(user.id, 'MOCK_LOCATION_DETECTED', {
        latitude: dto.latitude,
        longitude: dto.longitude,
        deviceInfo: dto.deviceInfo,
      }, ip);
      throw new ForbiddenException(
        'Terdeteksi lokasi palsu (mock location). Presensi diblokir.',
      );
    }

    // (2) Time-skew: jam perangkat menyimpang > 60 detik dari server.
    const skewSec = Math.abs(
      (now.getTime() - new Date(dto.clientTimestamp).getTime()) / 1000,
    );
    if (Number.isNaN(skewSec) || skewSec > MAX_CLOCK_SKEW_SEC) {
      await this.logFraud(user.id, 'TIME_SKEW_DETECTED', {
        clientTimestamp: dto.clientTimestamp,
        skewSec: Math.round(skewSec),
      }, ip);
      throw new UnprocessableEntityException(
        'Waktu perangkat tidak sinkron dengan server (> 60 detik).',
      );
    }

    // (3) Akurasi GPS buruk.
    if (dto.accuracyM != null && dto.accuracyM > MAX_GPS_ACCURACY_M) {
      throw new UnprocessableEntityException(
        `Akurasi GPS ${dto.accuracyM}m melebihi batas ${MAX_GPS_ACCURACY_M}m. Tunggu sinyal satelit mengunci.`,
      );
    }

    // (4) Impossible travel vs titik terakhir hari ini.
    const lastPoint = await this.lastPointToday(user.id, dateKey, now);
    if (
      lastPoint &&
      isImpossibleTravel(
        lastPoint.lat,
        lastPoint.lon,
        lastPoint.at,
        dto.latitude,
        dto.longitude,
        now,
      )
    ) {
      await this.logFraud(user.id, 'IMPOSSIBLE_TRAVEL_DETECTED', {
        from: lastPoint,
        to: { lat: dto.latitude, lon: dto.longitude },
      }, ip);
      throw new UnprocessableEntityException(
        'Perpindahan lokasi tidak wajar terdeteksi (> 120 km/jam).',
      );
    }

    // (5) Geofencing Haversine untuk OFFICE_BOUND.
    const distanceM = haversineMeters(
      dto.latitude,
      dto.longitude,
      branch.latitude.toNumber(),
      branch.longitude.toNumber(),
    );
    let locationStatus: LocationStatus;
    if (dbUser.workLocationType === WorkLocationType.OFFICE_BOUND) {
      const { inside } = checkGeofence(
        dto.latitude,
        dto.longitude,
        branch.latitude.toNumber(),
        branch.longitude.toNumber(),
        branch.geofenceRadiusM,
        dto.accuracyM ?? 0,
      );
      if (!inside) {
        throw new ForbiddenException({
          code: 'ERR_OUTSIDE_GEOFENCE_RADIUS',
          message: `Anda berada ${Math.round(distanceM)}m dari ${branch.name} (batas ${branch.geofenceRadiusM}m).`,
          distanceM: Math.round(distanceM * 100) / 100,
        });
      }
      locationStatus = LocationStatus.IN_OFFICE;
    } else {
      // FIELD_MOBILE selalu lolos; tandai status lokasi.
      locationStatus =
        distanceM <= branch.geofenceRadiusM
          ? LocationStatus.IN_OFFICE
          : LocationStatus.OUTSIDE_FIELD;
    }

    // (6) Tolak duplikat clock-in hari ini.
    const existing = await this.prisma.attendanceLog.findUnique({
      where: {
        userId_attendanceDate: {
          userId: user.id,
          attendanceDate: parseDateKey(dateKey),
        },
      },
    });
    if (existing?.clockInAt) {
      throw new ConflictException('Anda sudah melakukan clock-in hari ini.');
    }

    // (7) Simpan foto + hash integritas watermark.
    const photoUrl = await this.storage.save(
      file.buffer,
      `attendance/${user.id}/${dateKey}/in.jpg`,
      file.mimetype,
    );
    const clockInHash = hmac8(watermarkPayload(user.id, now.toISOString()));

    // (8) Keterlambatan vs jam mulai kerja cabang (WIB).
    const lateMinutes = computeLateMinutes(now, branch.workStartTime);

    const log = await this.prisma.attendanceLog.upsert({
      where: {
        userId_attendanceDate: {
          userId: user.id,
          attendanceDate: parseDateKey(dateKey),
        },
      },
      update: {
        clockInAt: now,
        clockInLat: dto.latitude,
        clockInLon: dto.longitude,
        clockInAccuracyM: dto.accuracyM ?? null,
        distanceInM: Math.round(distanceM * 100) / 100,
        clockInPhotoUrl: photoUrl,
        clockInHash,
        lateMinutes,
        isMockDetected: false,
        locationStatus,
        status:
          lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      },
      create: {
        userId: user.id,
        branchId: dbUser.branchId,
        attendanceDate: parseDateKey(dateKey),
        clockInAt: now,
        clockInLat: dto.latitude,
        clockInLon: dto.longitude,
        clockInAccuracyM: dto.accuracyM ?? null,
        distanceInM: Math.round(distanceM * 100) / 100,
        clockInPhotoUrl: photoUrl,
        clockInHash,
        lateMinutes,
        locationStatus,
        status:
          lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      },
    });

    // (9) Audit trail.
    await this.audit.log(user.id, 'ATTENDANCE_CLOCK_IN', 'AttendanceLog', log.id, {
      newValues: {
        attendanceDate: dateKey,
        lateMinutes,
        status: log.status,
        distanceInM: log.distanceInM?.toString(),
      },
      ip,
    });

    return {
      id: log.id,
      attendanceDate: dateKey,
      clockInAt: log.clockInAt,
      status: log.status,
      lateMinutes,
      distanceM: Math.round(distanceM * 100) / 100,
      locationStatus,
    };
  }

  // ---------------------------------------------------------------
  // CLOCK-OUT
  // ---------------------------------------------------------------
  async clockOut(
    user: AuthUser,
    dto: ClockOutDto,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Foto selfie clock-out wajib diunggah.');
    }
    const now = new Date();
    const dateKey = jakartaDateKey(now);

    if (dto.isMockDetected) {
      await this.logFraud(user.id, 'MOCK_LOCATION_DETECTED', {
        phase: 'clock-out',
        deviceInfo: dto.deviceInfo,
      }, ip);
      throw new ForbiddenException(
        'Terdeteksi lokasi palsu (mock location). Presensi diblokir.',
      );
    }
    const skewSec = Math.abs(
      (now.getTime() - new Date(dto.clientTimestamp).getTime()) / 1000,
    );
    if (Number.isNaN(skewSec) || skewSec > MAX_CLOCK_SKEW_SEC) {
      await this.logFraud(user.id, 'TIME_SKEW_DETECTED', {
        phase: 'clock-out',
        skewSec: Math.round(skewSec),
      }, ip);
      throw new UnprocessableEntityException(
        'Waktu perangkat tidak sinkron dengan server (> 60 detik).',
      );
    }

    const log = await this.prisma.attendanceLog.findUnique({
      where: {
        userId_attendanceDate: {
          userId: user.id,
          attendanceDate: parseDateKey(dateKey),
        },
      },
    });
    if (!log?.clockInAt) {
      throw new ConflictException(
        'Belum melakukan clock-in hari ini. Clock-out ditolak.',
      );
    }
    if (log.clockOutAt) {
      throw new ConflictException('Anda sudah melakukan clock-out hari ini.');
    }

    const photoUrl = await this.storage.save(
      file.buffer,
      `attendance/${user.id}/${dateKey}/out.jpg`,
      file.mimetype,
    );

    const updated = await this.prisma.attendanceLog.update({
      where: { id: log.id },
      data: {
        clockOutAt: now,
        clockOutLat: dto.latitude,
        clockOutLon: dto.longitude,
        clockOutPhotoUrl: photoUrl,
      },
    });

    await this.audit.log(user.id, 'ATTENDANCE_CLOCK_OUT', 'AttendanceLog', log.id, {
      newValues: { clockOutAt: now.toISOString() },
      ip,
    });

    return {
      id: updated.id,
      attendanceDate: dateKey,
      clockInAt: updated.clockInAt,
      clockOutAt: updated.clockOutAt,
      status: updated.status,
    };
  }

  // ---------------------------------------------------------------
  // Riwayat presensi diri: GET /attendance/me?month=YYYY-MM
  // ---------------------------------------------------------------
  async myHistory(user: AuthUser, month: string) {
    const { start, end } = this.monthRange(month);
    const logs: any[] = await this.prisma.attendanceLog.findMany({
      where: {
        userId: user.id,
        attendanceDate: { gte: start, lt: end },
      },
      orderBy: { attendanceDate: 'desc' },
    });
    return logs.map((l) => this.toDto(l));
  }

  // ---------------------------------------------------------------
  // Log cabang (SUPER_ADMIN, BRANCH_MANAGER, AUDITOR)
  // ---------------------------------------------------------------
  async branchLogs(user: AuthUser, date: string, branchId?: string) {
    const effectiveBranchId =
      user.role === Role.BRANCH_MANAGER ? user.branchId : branchId;
    const logs: any[] = await this.prisma.attendanceLog.findMany({
      where: {
        attendanceDate: parseDateKey(date),
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      include: {
        user: {
          select: { nip: true, fullName: true, jobTitle: true, role: true },
        },
        branch: { select: { branchCode: true, name: true } },
      },
      orderBy: { clockInAt: 'asc' },
    });
    return logs.map((l) => ({ ...this.toDto(l), user: l.user, branch: l.branch }));
  }

  // ---------------------------------------------------------------
  // Ekspor XLSX (SUPER_ADMIN, BRANCH_MANAGER, AUDITOR)
  // ---------------------------------------------------------------
  async exportXlsx(
    user: AuthUser,
    month: string,
    branchId: string | undefined,
    res: Response,
  ) {
    const effectiveBranchId =
      user.role === Role.BRANCH_MANAGER ? user.branchId : branchId;
    const { start, end } = this.monthRange(month);
    const logs: any[] = await this.prisma.attendanceLog.findMany({
      where: {
        attendanceDate: { gte: start, lt: end },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      include: {
        user: { select: { nip: true, fullName: true, jobTitle: true } },
        branch: { select: { branchCode: true, name: true } },
      },
      orderBy: [{ attendanceDate: 'asc' }, { clockInAt: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'HRIS Perbankan';
    const ws = wb.addWorksheet('Presensi');
    ws.columns = [
      { header: 'Tanggal', key: 'tanggal', width: 12 },
      { header: 'NIP', key: 'nip', width: 14 },
      { header: 'Nama', key: 'nama', width: 28 },
      { header: 'Jabatan', key: 'jabatan', width: 20 },
      { header: 'Cabang', key: 'cabang', width: 24 },
      { header: 'Clock In', key: 'clockIn', width: 20 },
      { header: 'Clock Out', key: 'clockOut', width: 20 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Terlambat (mnt)', key: 'late', width: 15 },
      { header: 'Jarak (m)', key: 'jarak', width: 12 },
      { header: 'Lokasi', key: 'lokasi', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const l of logs) {
      ws.addRow({
        tanggal: jakartaDateKey(l.attendanceDate),
        nip: l.user.nip,
        nama: l.user.fullName,
        jabatan: l.user.jobTitle ?? '-',
        cabang: `${l.branch.branchCode} - ${l.branch.name}`,
        clockIn: l.clockInAt ? jakartaDateKey(l.clockInAt) + ' ' + this.timeOf(l.clockInAt) : '-',
        clockOut: l.clockOutAt ? jakartaDateKey(l.clockOutAt) + ' ' + this.timeOf(l.clockOutAt) : '-',
        status: l.status,
        late: l.lateMinutes,
        jarak: l.distanceInM?.toString() ?? '-',
        lokasi: l.locationStatus ?? '-',
      });
    }

    const filename = `presensi-${month}${effectiveBranchId ? '-' + effectiveBranchId.slice(0, 8) : ''}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  }

  // ---------------------------------------------------------------
  // Cron 23:59 WIB — tandai ALPHA untuk yang tanpa log hari ini.
  // Dilewati pada Sabtu/Minggu & hari libur perusahaan.
  // Pengguna dengan cuti approved -> ON_LEAVE (bukan ALPHA).
  // ---------------------------------------------------------------
  @Cron('59 23 * * *', { timeZone: 'Asia/Jakarta' })
  async markAlphaDaily() {
    const now = new Date();
    if (isWeekendJakarta(now)) return;
    const dateKey = jakartaDateKey(now);
    const today = parseDateKey(dateKey);

    const holiday = await this.prisma.companyHoliday.findUnique({
      where: { holidayDate: today },
    });
    if (holiday) return;

    const users: any[] = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, branchId: true },
    });
    if (users.length === 0) return;

    const existing: any[] = await this.prisma.attendanceLog.findMany({
      where: {
        attendanceDate: today,
        userId: { in: users.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const logged = new Set(existing.map((e) => e.userId));

    const onLeave: any[] = await this.prisma.leaveRequest.findMany({
      where: {
        approvalStatus: 'APPROVED',
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: { userId: true },
    });
    const leaveSet = new Set(onLeave.map((l) => l.userId));

    const missing = users.filter((u) => !logged.has(u.id));
    for (const u of missing) {
      await this.prisma.attendanceLog.upsert({
        where: {
          userId_attendanceDate: { userId: u.id, attendanceDate: today },
        },
        update: {},
        create: {
          userId: u.id,
          branchId: u.branchId,
          attendanceDate: today,
          status: leaveSet.has(u.id)
            ? AttendanceStatus.ON_LEAVE
            : AttendanceStatus.ALPHA,
          notes: 'Dibuat otomatis oleh cron 23:59 WIB',
        },
      });
    }

    await this.audit.log(null, 'ATTENDANCE_ALPHA_CRON', 'AttendanceLog', dateKey, {
      newValues: { marked: missing.length, date: dateKey },
    });
  }

  // ---------------------------------------------------------------
  // Helper privat
  // ---------------------------------------------------------------

  /** Titik lokasi terakhir user hari ini (checkpoint / live ping). */
  private async lastPointToday(
    userId: string,
    dateKey: string,
    now: Date,
  ): Promise<{ lat: number; lon: number; at: Date } | null> {
    const dayStart = parseDateKey(dateKey);
    const [cp, ping] = await Promise.all([
      this.prisma.fieldCheckpoint.findFirst({
        where: { userId, checkinAt: { gte: dayStart, lte: now } },
        orderBy: { checkinAt: 'desc' },
        select: { latitude: true, longitude: true, checkinAt: true },
      }),
      this.prisma.liveLocationPing.findFirst({
        where: { userId, recordedAt: { gte: dayStart, lte: now } },
        orderBy: { recordedAt: 'desc' },
        select: { latitude: true, longitude: true, recordedAt: true },
      }),
    ]);
    const cps = cp
      ? { lat: cp.latitude.toNumber(), lon: cp.longitude.toNumber(), at: cp.checkinAt }
      : null;
    const pgs = ping
      ? { lat: ping.latitude.toNumber(), lon: ping.longitude.toNumber(), at: ping.recordedAt }
      : null;
    if (cps && pgs) return cps.at >= pgs.at ? cps : pgs;
    return cps ?? pgs;
  }

  private async logFraud(
    userId: string | undefined,
    incidentType: string,
    details: Record<string, unknown>,
    ip?: string,
  ) {
    await this.prisma.securityFraudLog.create({
      data: {
        userId,
        incidentType,
        details: details as unknown as Prisma.InputJsonValue,
        ipAddress: ip,
      },
    });
  }

  /** Rentang [awal bulan, awal bulan berikut) untuk 'YYYY-MM'. */
  private monthRange(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  private timeOf(d: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  }

  private toDto(l: {
    id: string;
    attendanceDate: Date;
    clockInAt: Date | null;
    clockOutAt: Date | null;
    lateMinutes: number;
    status: AttendanceStatus;
    locationStatus: LocationStatus | null;
    distanceInM: { toString(): string } | null;
    clockInPhotoUrl: string | null;
    clockOutPhotoUrl: string | null;
  }) {
    return {
      id: l.id,
      attendanceDate: jakartaDateKey(l.attendanceDate),
      clockInAt: l.clockInAt?.toISOString() ?? null,
      clockOutAt: l.clockOutAt?.toISOString() ?? null,
      lateMinutes: l.lateMinutes,
      status: l.status,
      locationStatus: l.locationStatus,
      distanceM: l.distanceInM ? Number(l.distanceInM.toString()) : null,
      clockInPhotoUrl: l.clockInPhotoUrl,
      clockOutPhotoUrl: l.clockOutPhotoUrl,
    };
  }
}

/** Re-export tipe DTO lokasi untuk dipakai modul lain bila perlu. */
export type { ClockLocationDto };

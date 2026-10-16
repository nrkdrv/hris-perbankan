import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role, WorkLocationType } from '@hris/shared';
import { PingTrigger } from '@prisma/client';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { FcmService } from '../../common/services/fcm.service';
import { hmac8, watermarkPayload } from '../attendance/utils/watermark.util';
import { jakartaDateKey, parseDateKey } from '../attendance/utils/jakarta-date.util';
import {
  CheckpointQueryDto,
  CreateCheckpointDto,
  LiveLocationDto,
} from './dto/field.dto';

@Injectable()
export class FieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly fcm: FcmService,
  ) {}

  // ---------------------------------------------------------------
  // POST /field/checkpoints — log kunjungan AO (FIELD_EMPLOYEE)
  // ---------------------------------------------------------------
  async createCheckpoint(
    user: AuthUser,
    dto: CreateCheckpointDto,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Foto checkpoint wajib diunggah.');
    }
    const now = new Date();
    const dateKey = jakartaDateKey(now);

    if (dto.isMockDetected) {
      await this.prisma.securityFraudLog.create({
        data: {
          userId: user.id,
          incidentType: 'MOCK_LOCATION_DETECTED',
          details: { phase: 'field-checkpoint' },
          ipAddress: ip,
        },
      });
      throw new ForbiddenException(
        'Terdeteksi lokasi palsu (mock location). Checkpoint diblokir.',
      );
    }

    // Wajib sudah clock-in hari ini.
    const attendance = await this.prisma.attendanceLog.findUnique({
      where: {
        userId_attendanceDate: {
          userId: user.id,
          attendanceDate: parseDateKey(dateKey),
        },
      },
    });
    if (!attendance?.clockInAt) {
      throw new UnprocessableEntityException(
        'Belum clock-in hari ini. Lakukan clock-in sebelum mencatat checkpoint.',
      );
    }

    const photoUrl = await this.storage.save(
      file.buffer,
      `field/${user.id}/${dateKey}/${now.getTime()}.jpg`,
      file.mimetype,
    );
    const photoHash = hmac8(watermarkPayload(user.id, now.toISOString()));

    const cp = await this.prisma.fieldCheckpoint.create({
      data: {
        userId: user.id,
        attendanceId: attendance.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM ?? null,
        reverseAddress: dto.reverseAddress ?? null,
        visitPurpose: dto.visitPurpose,
        clientName: dto.clientName ?? null,
        visitNotes: dto.visitNotes ?? null,
        watermarkedPhotoUrl: photoUrl,
        photoHash,
      },
    });

    await this.audit.log(user.id, 'FIELD_CHECKPOINT_CREATE', 'FieldCheckpoint', cp.id, {
      newValues: {
        visitPurpose: dto.visitPurpose,
        clientName: dto.clientName ?? null,
        checkinAt: now.toISOString(),
      },
      ip,
    });

    return {
      id: cp.id,
      checkinAt: cp.checkinAt.toISOString(),
      visitPurpose: cp.visitPurpose,
      clientName: cp.clientName,
      photoHash,
    };
  }

  // ---------------------------------------------------------------
  // GET /field/checkpoints/me — riwayat checkpoint
  // ---------------------------------------------------------------
  async myCheckpoints(user: AuthUser, q: CheckpointQueryDto) {
    // ?userId= hanya boleh dipakai SUPER_ADMIN / BRANCH_MANAGER.
    let targetUserId = user.id;
    if (q.userId && q.userId !== user.id) {
      if (
        user.role !== Role.SUPER_ADMIN &&
        user.role !== Role.BRANCH_MANAGER
      ) {
        throw new ForbiddenException(
          'Hanya admin/manager yang boleh melihat checkpoint pengguna lain.',
        );
      }
      if (user.role === Role.BRANCH_MANAGER) {
        const target = await this.prisma.user.findUnique({
          where: { id: q.userId },
          select: { branchId: true },
        });
        if (!target || target.branchId !== user.branchId) {
          throw new ForbiddenException(
            'Target pengguna di luar cabang Anda.',
          );
        }
      }
      targetUserId = q.userId;
    }

    const checkpoints: any[] = await this.prisma.fieldCheckpoint.findMany({
      where: {
        userId: targetUserId,
        ...(q.date
          ? {
              checkinAt: {
                gte: parseDateKey(q.date),
                lt: new Date(parseDateKey(q.date).getTime() + 86_400_000),
              },
            }
          : {}),
      },
      orderBy: { checkinAt: 'desc' },
      take: 200,
    });
    return checkpoints.map((c) => ({
      id: c.id,
      checkinAt: c.checkinAt.toISOString(),
      latitude: Number(c.latitude.toString()),
      longitude: Number(c.longitude.toString()),
      accuracyM: c.accuracyM ? Number(c.accuracyM.toString()) : null,
      visitPurpose: c.visitPurpose,
      clientName: c.clientName,
      visitNotes: c.visitNotes,
      reverseAddress: c.reverseAddress,
      watermarkedPhotoUrl: c.watermarkedPhotoUrl,
      photoHash: c.photoHash,
    }));
  }

  // ---------------------------------------------------------------
  // POST /field/ping-request — Admin/HRD memicu ping lokasi
  // karyawan lapangan via FCM (silent data message).
  // ---------------------------------------------------------------
  async pingRequest(requester: AuthUser, targetUserId: string, ip?: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target || !target.isActive) {
      throw new BadRequestException('Pengguna target tidak ditemukan/aktif.');
    }
    if (target.workLocationType !== WorkLocationType.FIELD_MOBILE) {
      throw new BadRequestException(
        'Ping lokasi hanya untuk karyawan lapangan (FIELD_MOBILE).',
      );
    }
    if (
      requester.role === Role.BRANCH_MANAGER &&
      target.branchId !== requester.branchId
    ) {
      throw new ForbiddenException('Target pengguna di luar cabang Anda.');
    }

    // Target wajib sedang clock-in (pemantauan hanya selama jam kerja aktif).
    const dateKey = jakartaDateKey(new Date());
    const attendance = await this.prisma.attendanceLog.findUnique({
      where: {
        userId_attendanceDate: {
          userId: targetUserId,
          attendanceDate: parseDateKey(dateKey),
        },
      },
    });
    if (!attendance?.clockInAt || attendance.clockOutAt) {
      throw new UnprocessableEntityException(
        'Target belum/sudah tidak clock-in hari ini. Ping dibatalkan.',
      );
    }
    if (!target.fcmToken) {
      throw new UnprocessableEntityException(
        'Perangkat target belum mendaftarkan FCM token.',
      );
    }

    const requestId = `req_${randomUUID().slice(0, 8)}`;
    // FcmService tidak pernah throw: tanpa kredensial ia mengembalikan
    // { sent:false, stub:true } (mode stub untuk dev/CI).
    const res = await this.fcm.sendDataMessage(target.fcmToken, {
      action: 'REQUEST_LIVE_LOCATION',
      requestId,
      requestedBy: requester.id,
    });

    await this.audit.log(requester.id, 'FIELD_PING_REQUEST', 'User', targetUserId, {
      newValues: { requestId, sent: res.sent, stub: res.stub },
      ip,
    });

    return { sent: res.sent, stub: res.stub, requestId };
  }

  // ---------------------------------------------------------------
  // POST /field/live-locations — balasan koordinat dari perangkat
  // ---------------------------------------------------------------
  async submitLiveLocation(user: AuthUser, dto: LiveLocationDto, ip?: string) {
    const dateKey = jakartaDateKey(new Date());
    const attendance = await this.prisma.attendanceLog.findUnique({
      where: {
        userId_attendanceDate: {
          userId: user.id,
          attendanceDate: parseDateKey(dateKey),
        },
      },
    });
    if (!attendance?.clockInAt || attendance.clockOutAt) {
      throw new ForbiddenException(
        'Lokasi hanya diterima selama status clock-in aktif.',
      );
    }

    const ping = await this.prisma.liveLocationPing.create({
      data: {
        userId: user.id,
        triggerType: PingTrigger.PERIODIC_SYNC,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM ?? null,
        batteryPct: dto.batteryPct ?? null,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      },
    });

    return { id: ping.id.toString(), recordedAt: ping.recordedAt.toISOString() };
  }

  // ---------------------------------------------------------------
  // GET /field/live-map — pin lokasi terakhir per karyawan lapangan
  // ---------------------------------------------------------------
  async liveMap(user: AuthUser) {
    const employees: any[] = await this.prisma.user.findMany({
      where: {
        isActive: true,
        workLocationType: WorkLocationType.FIELD_MOBILE,
        ...(user.role === Role.BRANCH_MANAGER
          ? { branchId: user.branchId }
          : {}),
      },
      select: {
        id: true,
        nip: true,
        fullName: true,
        jobTitle: true,
        branchId: true,
        branch: { select: { branchCode: true, name: true } },
      },
    });
    const ids = employees.map((e) => e.id);
    if (ids.length === 0) return [];

    // Ping terbaru per user (dedupe di kode; skala cabang kecil-menengah).
    const pings: any[] = await this.prisma.liveLocationPing.findMany({
      where: { userId: { in: ids } },
      orderBy: { recordedAt: 'desc' },
      take: ids.length * 5,
    });
    const latest = new Map<string, (typeof pings)[number]>();
    for (const p of pings) {
      if (!latest.has(p.userId)) latest.set(p.userId, p);
    }

    return employees.map((e) => {
      const p = latest.get(e.id);
      return {
        userId: e.id,
        nip: e.nip,
        fullName: e.fullName,
        jobTitle: e.jobTitle,
        branch: e.branch,
        lastPing: p
          ? {
              latitude: Number(p.latitude.toString()),
              longitude: Number(p.longitude.toString()),
              accuracyM: p.accuracyM ? Number(p.accuracyM.toString()) : null,
              batteryPct: p.batteryPct,
              triggerType: p.triggerType,
              recordedAt: p.recordedAt.toISOString(),
            }
          : null,
      };
    });
  }
}

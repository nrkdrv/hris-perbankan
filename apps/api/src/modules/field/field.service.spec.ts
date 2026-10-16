import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Role,
  VisitPurpose,
  WorkLocationType,
} from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { FieldService } from './field.service';

const ADMIN: AuthUser = {
  id: 'admin1',
  nip: 'SA-001',
  role: Role.SUPER_ADMIN,
  branchId: 'b1',
  fullName: 'Administrator',
  email: 'admin@bank.local',
  workLocationType: WorkLocationType.OFFICE_BOUND,
};

function makeService() {
  const prisma: any = {
    securityFraudLog: { create: vi.fn().mockResolvedValue({}) },
    attendanceLog: { findUnique: vi.fn() },
    fieldCheckpoint: {
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'cp1', checkinAt: new Date(), ...data }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: { findUnique: vi.fn() },
    liveLocationPing: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const audit: any = { log: vi.fn().mockResolvedValue({}) };
  const storage: any = { save: vi.fn().mockResolvedValue('field/u1/x.jpg') };
  const fcm: any = {
    sendDataMessage: vi.fn().mockResolvedValue({ sent: true, stub: true }),
    notifyUser: vi.fn(),
  };
  const service = new FieldService(prisma, audit, storage, fcm);
  return { service, prisma, audit, storage, fcm };
}

const PHOTO: any = { buffer: Buffer.from('fake-jpeg'), mimetype: 'image/jpeg' };

function checkpointDto(overrides: Record<string, unknown> = {}) {
  return {
    latitude: -7.2575,
    longitude: 112.7521,
    accuracyM: 8,
    visitPurpose: VisitPurpose.SURVEY_AGUNAN,
    clientName: 'PT Maju Jaya',
    ...overrides,
  } as any;
}

describe('FieldService.createCheckpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak 422 bila belum clock-in hari ini', async () => {
    const { service, prisma } = makeService();
    prisma.attendanceLog.findUnique.mockResolvedValue(null);
    const err = await service
      .createCheckpoint(ADMIN, checkpointDto(), PHOTO, '127.0.0.1')
      .catch((e) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.fieldCheckpoint.create).not.toHaveBeenCalled();
  });

  it('menyimpan checkpoint + photoHash 8-char bila sudah clock-in', async () => {
    const { service, prisma, audit, storage } = makeService();
    prisma.attendanceLog.findUnique.mockResolvedValue({
      id: 'att1',
      clockInAt: new Date(),
    });
    const res: any = await service.createCheckpoint(
      ADMIN,
      checkpointDto(),
      PHOTO,
      '127.0.0.1',
    );
    expect(res.id).toBe('cp1');
    expect(res.photoHash).toMatch(/^[0-9a-f]{8}$/);
    expect(storage.save).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringMatching(/^field\/admin1\/\d{4}-\d{2}-\d{2}\/\d+\.jpg$/),
      'image/jpeg',
    );
    expect(prisma.fieldCheckpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attendanceId: 'att1',
          visitPurpose: VisitPurpose.SURVEY_AGUNAN,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'admin1',
      'FIELD_CHECKPOINT_CREATE',
      'FieldCheckpoint',
      'cp1',
      expect.objectContaining({ ip: '127.0.0.1' }),
    );
  });
});

describe('FieldService.pingRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak target non-lapangan (400)', async () => {
    const { service, prisma, fcm } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u9',
      isActive: true,
      workLocationType: WorkLocationType.OFFICE_BOUND,
      branchId: 'b1',
      fcmToken: 'tok',
    });
    const err = await service
      .pingRequest(ADMIN, 'u9', '127.0.0.1')
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(fcm.sendDataMessage).not.toHaveBeenCalled();
  });

  it('mengirim FCM data message REQUEST_LIVE_LOCATION bila valid', async () => {
    const { service, prisma, fcm, audit } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      isActive: true,
      workLocationType: WorkLocationType.FIELD_MOBILE,
      branchId: 'b1',
      fcmToken: 'tok-abc',
    });
    prisma.attendanceLog.findUnique.mockResolvedValue({
      id: 'att2',
      clockInAt: new Date(),
      clockOutAt: null,
    });
    const res: any = await service.pingRequest(ADMIN, 'u2', '127.0.0.1');
    expect(res.sent).toBe(true);
    expect(fcm.sendDataMessage).toHaveBeenCalledWith(
      'tok-abc',
      expect.objectContaining({
        action: 'REQUEST_LIVE_LOCATION',
        requestedBy: 'admin1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'admin1',
      'FIELD_PING_REQUEST',
      'User',
      'u2',
      expect.objectContaining({
        newValues: expect.objectContaining({ requestId: expect.any(String) }),
      }),
    );
  });

  it('manager tidak boleh ping karyawan cabang lain (403)', async () => {
    const { service, fcm } = makeService();
    const mgr: AuthUser = {
      id: 'm1',
      nip: 'MGR-001',
      role: Role.BRANCH_MANAGER,
      branchId: 'b1',
      fullName: 'Budi Santoso',
      email: 'budi.santoso@bank.local',
      workLocationType: WorkLocationType.OFFICE_BOUND,
    };
    (service as any).prisma.user.findUnique.mockResolvedValue({
      id: 'u3',
      isActive: true,
      workLocationType: WorkLocationType.FIELD_MOBILE,
      branchId: 'b2', // cabang lain
      fcmToken: 'tok',
    });
    const { ForbiddenException } = await import('@nestjs/common');
    const err = await service.pingRequest(mgr, 'u3', '127.0.0.1').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(fcm.sendDataMessage).not.toHaveBeenCalled();
  });
});

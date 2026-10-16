import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  Role,
  WorkLocationType,
  checkGeofence,
  haversineMeters,
} from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { AttendanceService } from './attendance.service';
import { hmac8 } from './utils/watermark.util';
import { jakartaDateKey } from './utils/jakarta-date.util';

// ---- util geospasial (re-use dari @hris/shared) ----
describe('geo utils', () => {
  it('haversineMeters: titik sama -> 0', () => {
    expect(haversineMeters(-7.2575, 112.7521, -7.2575, 112.7521)).toBe(0);
  });

  it('haversineMeters: Jakarta-Surabaya ~ 660-700 km', () => {
    const d = haversineMeters(-6.2088, 106.8456, -7.2575, 112.7521);
    expect(d).toBeGreaterThan(600_000);
    expect(d).toBeLessThan(750_000);
  });

  it('checkGeofence: di dalam radius 75m', () => {
    const r = checkGeofence(-7.2575, 112.7521, -7.2575, 112.7521, 75);
    expect(r.inside).toBe(true);
    expect(r.distanceM).toBe(0);
  });

  it('checkGeofence: di luar radius -> inside=false', () => {
    // ~111 m ke utara (0.001 derajat lintang)
    const r = checkGeofence(-7.2565, 112.7521, -7.2575, 112.7521, 75);
    expect(r.inside).toBe(false);
    expect(r.distanceM).toBeGreaterThan(100);
  });
});

describe('watermark hmac8', () => {
  it('menghasilkan 8 karakter hex deterministik', () => {
    const a = hmac8('uid|x', 'secret');
    expect(a).toHaveLength(8);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(hmac8('uid|x', 'secret')).toBe(a);
    expect(hmac8('uid|y', 'secret')).not.toBe(a);
  });
});

// ---- validasi clock-in (service dengan mock) ----
const BRANCH = {
  latitude: { toNumber: () => -7.2575 },
  longitude: { toNumber: () => 112.7521 },
  geofenceRadiusM: 75,
  workStartTime: '08:00',
  name: 'Kantor Cabang Surabaya',
};

function makeService(workLocationType: WorkLocationType = WorkLocationType.OFFICE_BOUND) {
  const prisma: any = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        isActive: true,
        branchId: 'b1',
        workLocationType,
        branch: BRANCH,
      }),
    },
    attendanceLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'log1', ...create, clockInAt: create.clockInAt }),
      ),
    },
    fieldCheckpoint: { findFirst: vi.fn().mockResolvedValue(null) },
    liveLocationPing: { findFirst: vi.fn().mockResolvedValue(null) },
    securityFraudLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const audit: any = { log: vi.fn().mockResolvedValue({}) };
  const storage: any = {
    save: vi.fn().mockResolvedValue('attendance/u1/2026-10-16/in.jpg'),
  };
  const service = new AttendanceService(prisma, audit, storage);
  return { service, prisma, audit, storage };
}

const ME: AuthUser = {
  id: 'u1',
  nip: 'TLL-001',
  role: Role.OFFICE_EMPLOYEE,
  branchId: 'b1',
  fullName: 'Siti Rahma',
  email: 'siti.rahma@bank.local',
  workLocationType: WorkLocationType.OFFICE_BOUND,
};

function clockInDto(overrides: Record<string, unknown> = {}) {
  return {
    latitude: -7.2575,
    longitude: 112.7521,
    accuracyM: 5,
    clientTimestamp: new Date().toISOString(),
    isMockDetected: false,
    ...overrides,
  } as any;
}

const PHOTO: any = { buffer: Buffer.from('fake-jpeg'), mimetype: 'image/jpeg' };

describe('AttendanceService.clockIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('menolak OFFICE_BOUND di luar radius geofence (403 ERR_OUTSIDE_GEOFENCE_RADIUS)', async () => {
    const { service, prisma } = makeService(WorkLocationType.OFFICE_BOUND);
    const err = await service
      .clockIn(
        ME,
        clockInDto({ latitude: -6.2088, longitude: 106.8456 }), // Jakarta, jauh dari SBY
        PHOTO,
        '127.0.0.1',
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      code: 'ERR_OUTSIDE_GEOFENCE_RADIUS',
    });
    expect(prisma.attendanceLog.upsert).not.toHaveBeenCalled();
  });

  it('memblokir mock location + mencatat fraud log (403)', async () => {
    const { service, prisma } = makeService();
    const err = await service
      .clockIn(ME, clockInDto({ isMockDetected: true }), PHOTO, '127.0.0.1')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(prisma.securityFraudLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ incidentType: 'MOCK_LOCATION_DETECTED' }),
      }),
    );
    expect(prisma.attendanceLog.upsert).not.toHaveBeenCalled();
  });

  it('FIELD_MOBILE di luar radius tetap lolos dengan status OUTSIDE_FIELD', async () => {
    const { service } = makeService(WorkLocationType.FIELD_MOBILE);
    const res: any = await service.clockIn(
      ME,
      clockInDto({ latitude: -6.2088, longitude: 106.8456 }),
      PHOTO,
      '127.0.0.1',
    );
    expect(res.locationStatus).toBe('OUTSIDE_FIELD');
    expect(res.attendanceDate).toBe(jakartaDateKey(new Date()));
    expect(res.distanceM).toBeGreaterThan(600_000);
  });

  it('OFFICE_BOUND di dalam radius lolos dengan status IN_OFFICE', async () => {
    const { service, audit } = makeService(WorkLocationType.OFFICE_BOUND);
    const res: any = await service.clockIn(ME, clockInDto(), PHOTO, '127.0.0.1');
    expect(res.locationStatus).toBe('IN_OFFICE');
    expect(res.distanceM).toBeLessThan(1);
    expect(audit.log).toHaveBeenCalledWith(
      'u1',
      'ATTENDANCE_CLOCK_IN',
      'AttendanceLog',
      expect.any(String),
      expect.objectContaining({ ip: '127.0.0.1' }),
    );
  });
});

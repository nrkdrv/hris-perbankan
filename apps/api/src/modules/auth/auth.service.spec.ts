import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { sha256Hex } from '../../common/utils/crypto';

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    ...prismaOverrides,
  };
  const jwt = { sign: vi.fn(() => 'access-token-jwt') };
  const config = {
    get: vi.fn((key: string, def?: unknown) => def),
    getOrThrow: vi.fn((key: string) => `test-${key}`),
  };
  const audit = { log: vi.fn(async () => undefined) };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    audit as never,
  );
  return { service, prisma, jwt, config, audit };
}

const baseUser = {
  id: 'user-1',
  nip: 'BPR-0001',
  fullName: 'Budi Santoso',
  email: 'budi@bank.test',
  passwordHash: bcrypt.hashSync('password123', 4),
  role: 'OFFICE_EMPLOYEE',
  jobTitle: 'Teller',
  branchId: 'branch-1',
  workLocationType: 'OFFICE_BOUND',
  deviceIdBound: null,
  isActive: true,
};

describe('AuthService.resolveDeviceBinding', () => {
  it('mengembalikan true (bind) saat belum ter-bind dan deviceId diberikan', () => {
    const { service } = makeService();
    expect(
      service.resolveDeviceBinding({ deviceIdBound: null }, 'dev-abc'),
    ).toBe(true);
  });

  it('mengembalikan false saat belum ter-bind dan deviceId tidak diberikan', () => {
    const { service } = makeService();
    expect(service.resolveDeviceBinding({ deviceIdBound: null })).toBe(false);
    expect(
      service.resolveDeviceBinding({ deviceIdBound: null }, undefined),
    ).toBe(false);
  });

  it('mengembalikan false saat deviceId sama dengan yang ter-bind', () => {
    const { service } = makeService();
    expect(
      service.resolveDeviceBinding({ deviceIdBound: 'dev-abc' }, 'dev-abc'),
    ).toBe(false);
  });

  it('melempar 403 saat deviceId berbeda dari yang ter-bind', () => {
    const { service } = makeService();
    expect(() =>
      service.resolveDeviceBinding({ deviceIdBound: 'dev-abc' }, 'dev-xyz'),
    ).toThrow(ForbiddenException);
  });
});

describe('AuthService.login', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('login sukses: bind deviceId baru, terbitkan token pair, audit tercatat', async () => {
    const { service, prisma, audit } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ ...baseUser });
    prisma.user.update.mockImplementation(async ({ data }: any) => ({
      ...baseUser,
      ...data,
      branch: { id: 'branch-1', name: 'Kantor Pusat' },
    }));

    const result = await service.login(
      { email: 'budi@bank.test', password: 'password123', deviceId: 'dev-abc' },
      { ip: '10.0.0.1', headers: { 'user-agent': 'test' } } as never,
    );

    expect(result.accessToken).toBe('access-token-jwt');
    expect(result.refreshToken).toHaveLength(64);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ deviceIdBound: 'dev-abc' }),
      }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenHash: sha256Hex(result.refreshToken),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'user-1',
      'AUTH_LOGIN',
      'User',
      'user-1',
      expect.anything(),
    );
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('login gagal: password salah → 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...baseUser });
    await expect(
      service.login(
        { email: 'budi@bank.test', password: 'salah' },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('login gagal: deviceId berbeda → 403', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      deviceIdBound: 'dev-lain',
    });
    await expect(
      service.login(
        {
          email: 'budi@bank.test',
          password: 'password123',
          deviceId: 'dev-baru',
        },
        undefined,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('login gagal: akun nonaktif → 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
    await expect(
      service.login(
        { email: 'budi@bank.test', password: 'password123' },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.refresh', () => {
  it('rotasi: revoke token lama lalu terbitkan pasangan baru', async () => {
    const { service, prisma } = makeService();
    const raw = 'r'.repeat(64);
    const record = {
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null,
      user: { ...baseUser, branch: { id: 'branch-1', name: 'Kantor Pusat' } },
    };
    prisma.refreshToken.findFirst.mockResolvedValue(record);
    prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);

    const result = await service.refresh(raw, undefined);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(result.accessToken).toBe('access-token-jwt');
    expect(result.refreshToken).not.toBe(raw);
  });

  it('token kedaluwarsa → 401', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findFirst.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      user: { ...baseUser },
    });
    await expect(service.refresh('x'.repeat(64), undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('tanpa cookie → 401', async () => {
    const { service } = makeService();
    await expect(service.refresh(undefined, undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

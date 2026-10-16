import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { Role } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { randomToken, sha256Hex } from '../../common/utils/crypto';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from './jwt.strategy';

export const REFRESH_COOKIE_NAME = 'hris_refresh';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface MinimalRequest {
  ip?: string;
  headers?: { 'user-agent'?: string };
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
}

function auditMeta(req?: MinimalRequest): {
  ip?: string;
  userAgent?: string;
} {
  return {
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Aturan device binding.
   * @returns true bila perangkat boleh di-bind ke akun (belum pernah ter-bind).
   * @throws ForbiddenException bila akun sudah terikat ke perangkat lain.
   */
  resolveDeviceBinding(
    user: { deviceIdBound: string | null },
    deviceId?: string,
  ): boolean {
    if (user.deviceIdBound) {
      if (deviceId && user.deviceIdBound !== deviceId) {
        throw new ForbiddenException(
          'Akun ini terikat ke perangkat lain. Hubungi HRD untuk reset.',
        );
      }
      return false;
    }
    return Boolean(deviceId);
  }

  async login(dto: LoginDto, req?: Request): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { branch: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Email atau kata sandi salah');
    }

    const shouldBind = this.resolveDeviceBinding(user, dto.deviceId);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(shouldBind ? { deviceIdBound: dto.deviceId } : {}),
        lastLoginAt: new Date(),
      },
      include: { branch: true },
    });

    const pair = await this.issueTokenPair(updated.id);
    await this.audit.log(user.id, 'AUTH_LOGIN', 'User', user.id, {
      ...auditMeta(req),
      newValues: { deviceId: dto.deviceId ?? null },
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: this.toPublicUser(updated),
    };
  }

  /**
   * Rotasi refresh token: token lama di-revoke, pasangan baru diterbitkan.
   * Dipanggil dari endpoint @Public /auth/refresh dengan validasi manual.
   */
  async refresh(
    rawRefreshToken: string | undefined,
    req?: Request,
  ): Promise<LoginResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token tidak ada');
    }
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: sha256Hex(rawRefreshToken), revokedAt: null },
      include: { user: { include: { branch: true } } },
    });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token tidak valid');
    }
    if (!record.user.isActive) {
      throw new UnauthorizedException('Akun tidak aktif');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const pair = await this.issueTokenPair(record.userId);
    await this.audit.log(record.userId, 'AUTH_REFRESH', 'User', record.userId, {
      ...auditMeta(req),
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: this.toPublicUser(record.user),
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: sha256Hex(rawRefreshToken), revokedAt: null },
    });
    if (record) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(record.userId, 'AUTH_LOGOUT', 'User', record.userId);
    }
  }

  async me(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });
    if (!user) {
      throw new UnauthorizedException('Pengguna tidak ditemukan');
    }
    return this.toPublicUser(user);
  }

  private async issueTokenPair(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const accessToken = this.jwt.sign({
      sub: user.id,
      nip: user.nip,
      role: user.role,
      branchId: user.branchId,
    });
    const refreshToken = randomToken(32);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken };
  }

  toPublicUser(user: {
    id: string;
    nip: string;
    fullName: string;
    email: string;
    role: unknown;
    jobTitle: string | null;
    branchId: string;
    workLocationType: unknown;
    branch?: unknown;
  }): Record<string, unknown> {
    return {
      id: user.id,
      nip: user.nip,
      fullName: user.fullName,
      email: user.email,
      role: user.role as Role,
      jobTitle: user.jobTitle,
      branchId: user.branchId,
      workLocationType: user.workLocationType,
      branch: user.branch ?? null,
    };
  }
}

export type { AuthUser };

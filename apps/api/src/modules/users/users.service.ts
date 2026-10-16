import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { Role } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../auth/jwt.strategy';

const userSelect = {
  id: true,
  nip: true,
  fullName: true,
  email: true,
  role: true,
  jobTitle: true,
  branchId: true,
  branch: { select: { id: true, branchCode: true, name: true } },
  workLocationType: true,
  birthDate: true,
  phone: true,
  ptkpStatus: true,
  deviceIdBound: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * SUPER_ADMIN: semua user (filter branchId/role opsional).
   * BRANCH_MANAGER: otomatis hanya user di cabangnya sendiri.
   */
  async findAll(
    actor: AuthUser,
    filters: { branchId?: string; role?: Role },
  ): Promise<unknown[]> {
    const where: Prisma.UserWhereInput = {};
    if (actor.role === Role.BRANCH_MANAGER) {
      where.branchId = actor.branchId;
    } else if (filters.branchId) {
      where.branchId = filters.branchId;
    }
    if (filters.role) {
      where.role = filters.role;
    }
    return this.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }
    return user;
  }

  async create(
    dto: CreateUserDto,
    actor: AuthUser,
    req?: Request,
  ): Promise<unknown> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException('Cabang tidak ditemukan');
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          nip: dto.nip,
          fullName: dto.fullName,
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: dto.role,
          jobTitle: dto.jobTitle,
          branchId: dto.branchId,
          workLocationType: dto.workLocationType ?? 'OFFICE_BOUND',
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          phone: dto.phone,
          ptkpStatus: dto.ptkpStatus ?? 'TK/0',
        },
        select: userSelect,
      });
      await this.audit.log(actor.id, 'USER_CREATE', 'User', user.id, {
        newValues: { nip: user.nip, email: user.email, role: user.role },
        ip: req?.ip,
        userAgent: req?.headers['user-agent'] as string | undefined,
      });
      return user;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('NIP atau email sudah terdaftar');
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthUser,
    req?: Request,
  ): Promise<unknown> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException('Cabang tidak ditemukan');
      }
    }
    const data: Prisma.UserUpdateInput = {
      fullName: dto.fullName,
      email: dto.email,
      jobTitle: dto.jobTitle,
      role: dto.role,
      phone: dto.phone,
      ptkpStatus: dto.ptkpStatus,
      workLocationType: dto.workLocationType,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    };
    if (dto.branchId) {
      data.branch = { connect: { id: dto.branchId } };
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        select: userSelect,
      });
      await this.audit.log(actor.id, 'USER_UPDATE', 'User', id, {
        oldValues: {
          role: existing.role,
          workLocationType: existing.workLocationType,
          branchId: existing.branchId,
        },
        newValues: {
          role: dto.role ?? existing.role,
          workLocationType: dto.workLocationType ?? existing.workLocationType,
          branchId: dto.branchId ?? existing.branchId,
        },
        ip: req?.ip,
        userAgent: req?.headers['user-agent'] as string | undefined,
      });
      return user;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Email sudah terdaftar');
      }
      throw err;
    }
  }

  async setActive(
    id: string,
    isActive: boolean,
    actor: AuthUser,
    req?: Request,
  ): Promise<unknown> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: userSelect,
    });
    await this.audit.log(
      actor.id,
      isActive ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      'User',
      id,
      {
        oldValues: { isActive: existing.isActive },
        newValues: { isActive },
        ip: req?.ip,
        userAgent: req?.headers['user-agent'] as string | undefined,
      },
    );
    return user;
  }
}

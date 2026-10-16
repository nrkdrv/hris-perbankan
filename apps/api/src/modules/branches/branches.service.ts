import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AuthUser } from '../auth/jwt.strategy';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(): Promise<unknown[]> {
    return this.prisma.branch.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<unknown> {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Cabang tidak ditemukan');
    }
    return branch;
  }

  async create(
    dto: CreateBranchDto,
    actor: AuthUser,
    req?: Request,
  ): Promise<unknown> {
    try {
      const branch = await this.prisma.branch.create({
        data: {
          branchCode: dto.branchCode,
          name: dto.name,
          address: dto.address,
          latitude: new Prisma.Decimal(dto.latitude),
          longitude: new Prisma.Decimal(dto.longitude),
          geofenceRadiusM: dto.geofenceRadiusM,
          allowedPublicIps: dto.allowedPublicIps ?? [],
          minTellerQuota: dto.minTellerQuota,
          minCsQuota: dto.minCsQuota,
          workStartTime: dto.workStartTime,
          workEndTime: dto.workEndTime,
        },
      });
      await this.audit.log(actor.id, 'BRANCH_CREATE', 'Branch', branch.id, {
        newValues: { branchCode: branch.branchCode, name: branch.name },
        ip: req?.ip,
        userAgent: req?.headers['user-agent'] as string | undefined,
      });
      return branch;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Kode cabang sudah terdaftar');
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
    actor: AuthUser,
    req?: Request,
  ): Promise<unknown> {
    const existing = await this.prisma.branch.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Cabang tidak ditemukan');
    }
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        latitude:
          dto.latitude === undefined
            ? undefined
            : new Prisma.Decimal(dto.latitude),
        longitude:
          dto.longitude === undefined
            ? undefined
            : new Prisma.Decimal(dto.longitude),
        geofenceRadiusM: dto.geofenceRadiusM,
        allowedPublicIps: dto.allowedPublicIps,
        minTellerQuota: dto.minTellerQuota,
        minCsQuota: dto.minCsQuota,
        workStartTime: dto.workStartTime,
        workEndTime: dto.workEndTime,
        isActive: dto.isActive,
      },
    });
    await this.audit.log(actor.id, 'BRANCH_UPDATE', 'Branch', id, {
      oldValues: {
        name: existing.name,
        geofenceRadiusM: existing.geofenceRadiusM,
      },
      newValues: dto,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'] as string | undefined,
    });
    return branch;
  }
}

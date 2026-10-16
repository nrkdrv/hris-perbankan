import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogOptions {
  oldValues?: unknown;
  newValues?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Penulis jejak audit immutable (tabel audit_trails bersifat append-only).
 * Setiap mutasi penting wajib memanggil log() ini.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    opts: AuditLogOptions = {},
  ): Promise<void> {
    await this.prisma.auditTrail.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        oldValues:
          opts.oldValues === undefined
            ? undefined
            : (opts.oldValues as Prisma.InputJsonValue),
        newValues:
          opts.newValues === undefined
            ? undefined
            : (opts.newValues as Prisma.InputJsonValue),
        ipAddress: opts.ip,
        userAgent: opts.userAgent,
      },
    });
  }
}

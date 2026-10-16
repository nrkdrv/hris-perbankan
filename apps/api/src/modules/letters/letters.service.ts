import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addWorkingDays, ArchiveStatus, buildLetterNumber, Role } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { FcmService } from '../../common/services/fcm.service';
import { sha256Hex } from '../core/crypto.util';
import { notifySafe } from '../core/notify.util';
import { isPrivileged, requestUser } from '../core/request-user';
import { ExpeditionBookQueryDto, GenerateNumberDto } from './dto';

const LETTER_INCLUDE = {
  requester: { select: { id: true, fullName: true, nip: true } },
} as const;

@Injectable()
export class LettersService {
  private readonly logger = new Logger(LettersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Generate nomor surat secara ATOMIK.
   * Satu statement SQL INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING
   * menjamin 20 request bersamaan mendapat nomor berurutan tanpa duplikasi.
   */
  async generateNumber(dto: GenerateNumberDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const now = new Date();
    const year = now.getFullYear();

    const rows = await this.prisma.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "LetterSequence" ("id", "entityCode", "categoryCode", "year", "lastNumber")
      VALUES (gen_random_uuid(), ${dto.entityCode}, ${dto.categoryCode}, ${year}, 1)
      ON CONFLICT ("entityCode", "categoryCode", "year")
      DO UPDATE SET "lastNumber" = "LetterSequence"."lastNumber" + 1
      RETURNING "lastNumber"`;
    const seq = rows[0]?.lastNumber;
    if (seq == null) {
      throw new BadRequestException('Gagal mengalokasikan nomor surat');
    }

    const letterNumber = buildLetterNumber(seq, dto.categoryCode, dto.entityCode, now);
    const letter = await this.prisma.officialLetter.create({
      data: {
        letterNumber,
        categoryCode: dto.categoryCode,
        entityCode: dto.entityCode,
        subject: dto.subject,
        recipient: dto.recipient,
        requestedBy: actor.id,
        archiveStatus: ArchiveStatus.RESERVED_PENDING_SCAN,
        scanDueAt: addWorkingDays(now, 3),
      },
      include: LETTER_INCLUDE,
    });

    await this.audit.log(actor.id, 'LETTER_GENERATE', 'OfficialLetter', letter.id, {
      newValues: { letterNumber, categoryCode: dto.categoryCode, entityCode: dto.entityCode },
    });
    await notifySafe(
      this.fcm,
      actor.id,
      'Nomor surat diterbitkan',
      `Nomor ${letterNumber} dicadangkan. Unggah scan PDF maksimal H+3 hari kerja.`,
      { letterId: letter.id },
    );
    return letter;
  }

  /**
   * Unggah scan PDF bertanda tangan. Menghitung SHA-256 checksum,
   * menyimpan ke storage, dan menandai arsip terverifikasi (siap audit OJK).
   */
  async uploadScan(id: string, file: Express.Multer.File, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const letter = await this.prisma.officialLetter.findUnique({ where: { id } });
    if (!letter) throw new NotFoundException('Surat tidak ditemukan');

    const isRequester = letter.requestedBy === actor.id;
    if (!isRequester && !isPrivileged(actor.role)) {
      throw new ForbiddenException('Hanya pemohon, SUPER_ADMIN, atau BRANCH_MANAGER yang dapat mengunggah scan');
    }
    if (!file) {
      throw new BadRequestException('File PDF wajib diunggah (field: pdf)');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Hanya file application/pdf yang diizinkan');
    }

    const checksum = sha256Hex(file.buffer);
    const key = `letters/${id}/scan.pdf`;
    const url = await this.storage.save(file.buffer, key, 'application/pdf');

    const updated = await this.prisma.officialLetter.update({
      where: { id },
      data: {
        signedPdfUrl: url,
        pdfSha256: checksum,
        archiveStatus: ArchiveStatus.ARCHIVED_VERIFIED,
        releaseDate: new Date(),
      },
      include: LETTER_INCLUDE,
    });
    await this.audit.log(actor.id, 'LETTER_SCAN_UPLOAD', 'OfficialLetter', id, {
      oldValues: { archiveStatus: letter.archiveStatus },
      newValues: { archiveStatus: ArchiveStatus.ARCHIVED_VERIFIED, pdfSha256: checksum },
    });
    return updated;
  }

  /** Buku ekspedisi: filter entitas, status arsip, dan pencarian bebas. */
  expeditionBook(query: ExpeditionBookQueryDto) {
    const q = query.q?.trim();
    return this.prisma.officialLetter.findMany({
      where: {
        entityCode: query.entityCode,
        archiveStatus: query.status,
        ...(q
          ? {
              OR: [
                { letterNumber: { contains: q, mode: 'insensitive' } },
                { subject: { contains: q, mode: 'insensitive' } },
                { recipient: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: LETTER_INCLUDE,
    });
  }

  /** Surat-surat milik pemohon yang sedang login. */
  myLetters(actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    return this.prisma.officialLetter.findMany({
      where: { requestedBy: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: LETTER_INCLUDE,
    });
  }

  async getById(id: string, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const letter = await this.prisma.officialLetter.findUnique({
      where: { id },
      include: LETTER_INCLUDE,
    });
    if (!letter) throw new NotFoundException('Surat tidak ditemukan');
    const canView =
      letter.requestedBy === actor.id ||
      isPrivileged(actor.role) ||
      actor.role === Role.AUDITOR;
    if (!canView) {
      throw new ForbiddenException('Anda tidak berhak melihat surat ini');
    }
    return letter;
  }

  /**
   * Cron 07:00 WIB — surat yang melewati batas unggah scan (H+3 hari kerja)
   * dan masih RESERVED_PENDING_SCAN → OVERDUE_SCAN + notifikasi pemohon.
   */
  @Cron('0 7 * * *', { timeZone: 'Asia/Jakarta' })
  async handleOverdueScans() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const letters = await this.prisma.officialLetter.findMany({
        where: {
          archiveStatus: ArchiveStatus.RESERVED_PENDING_SCAN,
          scanDueAt: { lt: today },
        },
      });
      for (const letter of letters) {
        await this.prisma.officialLetter.update({
          where: { id: letter.id },
          data: { archiveStatus: ArchiveStatus.OVERDUE_SCAN },
        });
        await this.audit.log(null, 'LETTER_SCAN_OVERDUE', 'OfficialLetter', letter.id, {
          oldValues: { archiveStatus: ArchiveStatus.RESERVED_PENDING_SCAN },
          newValues: { archiveStatus: ArchiveStatus.OVERDUE_SCAN },
        });
        await notifySafe(
          this.fcm,
          letter.requestedBy,
          'Batas unggah scan surat terlewati',
          `Surat ${letter.letterNumber} belum memiliki scan PDF. Segera unggah arsipnya.`,
          { letterId: letter.id },
        );
      }
      if (letters.length > 0) {
        this.logger.log(`${letters.length} surat ditandai OVERDUE_SCAN`);
      }
    } catch (err) {
      this.logger.error(`Gagal menjalankan overdue scan check: ${(err as Error).message}`);
    }
  }
}

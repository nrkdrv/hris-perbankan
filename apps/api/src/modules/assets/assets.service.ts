import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { FcmService } from '../../common/services/fcm.service';
import { notifySafe } from '../core/notify.util';
import { isPrivileged, requestUser } from '../core/request-user';
import { buildAssetCode } from '@hris/shared';
import { buildBastPdf, computeDepreciation } from './assets.util';
import { CreateAssetDto, HandoverDto, ListAssetsQueryDto, UpdateConditionDto } from './dto';

const ASSET_INCLUDE = {
  branch: { select: { id: true, branchCode: true, name: true } },
  currentPic: { select: { id: true, fullName: true, nip: true } },
} as const;

const HANDOVER_INCLUDE = {
  fromUser: { select: { id: true, fullName: true, nip: true } },
  toUser: { select: { id: true, fullName: true, nip: true } },
} as const;

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly fcm: FcmService,
  ) {}

  /**
   * Registrasi aset dengan kode otomatis INV/{kategori}/{kode_kantor}/{tahun}/{urut4}.
   * Nomor urut dihitung dalam transaksi dengan SELECT ... FOR UPDATE
   * atas baris kandidat agar dua registrasi bersamaan tidak berebut nomor.
   */
  async create(dto: CreateAssetDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    const year = dto.acquisitionDate
      ? new Date(dto.acquisitionDate).getFullYear()
      : new Date().getFullYear();

    // Retry sekali bila bentrok kode unik pada konkurensi tinggi.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const asset = await this.prisma.$transaction(async (tx: any) => {
          const rows = await tx.$queryRaw<Array<{ maxSeq: number | null }>>`
            SELECT MAX(CAST(SPLIT_PART("assetCode", '/', 5) AS INTEGER)) AS "maxSeq"
            FROM "InventoryAsset"
            WHERE "categoryCode" = ${dto.categoryCode}
              AND "branchId" = ${dto.branchId}::uuid
              AND "assetCode" LIKE ${`INV/${dto.categoryCode}/${branch.branchCode}/${year}/%`}
            FOR UPDATE`;
          const seq = Number(rows[0]?.maxSeq ?? 0) + 1;
          const assetCode = buildAssetCode(dto.categoryCode, branch.branchCode, year, seq);
          return tx.inventoryAsset.create({
            data: {
              assetCode,
              name: dto.name,
              categoryCode: dto.categoryCode,
              branchId: dto.branchId,
              serialNumber: dto.serialNumber,
              specifications: dto.specifications,
              acquisitionDate: dto.acquisitionDate ? new Date(dto.acquisitionDate) : undefined,
              acquisitionCost: dto.acquisitionCost,
              usefulLifeMonths: dto.usefulLifeMonths,
            },
            include: ASSET_INCLUDE,
          });
        });
        await this.audit.log(actor.id, 'ASSET_CREATE', 'InventoryAsset', asset.id, {
          newValues: { assetCode: asset.assetCode, name: dto.name },
        });
        return asset;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'P2002' && attempt === 0) continue; // bentrok kode unik → hitung ulang
        throw err;
      }
    }
    throw new Error('Gagal meregistrasi aset setelah percobaan ulang');
  }

  list(query: ListAssetsQueryDto) {
    const q = query.q?.trim();
    return this.prisma.inventoryAsset.findMany({
      where: {
        branchId: query.branchId,
        conditionStatus: query.condition,
        ...(q
          ? {
              OR: [
                { assetCode: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { serialNumber: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: ASSET_INCLUDE,
    });
  }

  async getById(id: string) {
    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id },
      include: {
        ...ASSET_INCLUDE,
        handovers: {
          orderBy: { handoverDate: 'desc' },
          include: HANDOVER_INCLUDE,
        },
      },
    });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan');
    return this.withDepreciation(asset);
  }

  /** Detail aset + BAST aktif (handover terakhir) — dipakai saat QR dipindai auditor. */
  async scanByCode(assetCode: string) {
    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { assetCode },
      include: {
        ...ASSET_INCLUDE,
        handovers: {
          orderBy: { handoverDate: 'desc' },
          take: 1,
          include: HANDOVER_INCLUDE,
        },
      },
    });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan');
    const withDep = this.withDepreciation(asset);
    return { ...withDep, activeBast: asset.handovers[0] ?? null };
  }

  /** PNG QR-Code berisi assetCode. */
  async qrPng(id: string): Promise<Buffer> {
    const asset = await this.prisma.inventoryAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan');
    return QRCode.toBuffer(asset.assetCode, { type: 'png', width: 256, margin: 1 });
  }

  async updateCondition(id: string, dto: UpdateConditionDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const asset = await this.prisma.inventoryAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan');
    const updated = await this.prisma.inventoryAsset.update({
      where: { id },
      data: { conditionStatus: dto.conditionStatus },
      include: ASSET_INCLUDE,
    });
    await this.audit.log(actor.id, 'ASSET_CONDITION', 'InventoryAsset', id, {
      oldValues: { conditionStatus: asset.conditionStatus },
      newValues: { conditionStatus: dto.conditionStatus, notes: dto.notes ?? null },
    });
    return updated;
  }

  /**
   * Mutasi PIC + generate PDF BAST digital.
   * ID handover dibuat di sisi aplikasi agar PDF dapat disimpan ke storage
   * sebelum transaksi DB di-commit (menghindari file yatim bila DB gagal).
   */
  async handover(id: string, dto: HandoverDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id },
      include: ASSET_INCLUDE,
    });
    if (!asset) throw new NotFoundException('Aset tidak ditemukan');
    if (!isPrivileged(actor.role)) {
      // pertahanan ganda selain @Roles di controller
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat memproses serah terima aset');
    }
    const toUser = await this.prisma.user.findUnique({ where: { id: dto.toUserId } });
    if (!toUser) throw new NotFoundException('Karyawan penerima tidak ditemukan');

    const handoverId = randomUUID();
    const handoverDate = new Date();
    const pdf = await buildBastPdf({
      assetCode: asset.assetCode,
      assetName: asset.name,
      serialNumber: asset.serialNumber,
      branchName: asset.branch?.name,
      fromName: asset.currentPic?.fullName,
      fromNip: asset.currentPic?.nip,
      toName: toUser.fullName,
      toNip: toUser.nip,
      handoverDate,
      notes: dto.notes,
    });
    const bastKey = `assets/${id}/bast-${handoverId}.pdf`;
    const bastUrl = await this.storage.save(pdf, bastKey, 'application/pdf');

    const handover = await this.prisma.$transaction(async (tx: any) => {
      const h = await tx.assetHandover.create({
        data: {
          id: handoverId,
          assetId: id,
          fromUserId: asset.currentPicUserId,
          toUserId: dto.toUserId,
          handoverDate,
          bastPdfUrl: bastUrl,
          notes: dto.notes,
        },
        include: HANDOVER_INCLUDE,
      });
      await tx.inventoryAsset.update({
        where: { id },
        data: { currentPicUserId: dto.toUserId },
      });
      return h;
    });

    await this.audit.log(actor.id, 'ASSET_HANDOVER', 'AssetHandover', handover.id, {
      oldValues: { fromUserId: asset.currentPicUserId },
      newValues: { toUserId: dto.toUserId, assetId: id },
    });
    await notifySafe(
      this.fcm,
      dto.toUserId,
      'Aset diserahterimakan kepada Anda',
      `${asset.assetCode} — ${asset.name}. BAST digital tersedia di aplikasi.`,
      { assetId: id, handoverId: handover.id },
    );
    return handover;
  }

  private withDepreciation<T extends { acquisitionCost: unknown; usefulLifeMonths: number | null; acquisitionDate: Date | null }>(
    asset: T,
  ) {
    const cost = asset.acquisitionCost == null ? null : Number(asset.acquisitionCost);
    const { monthlyDepreciation, bookValue } = computeDepreciation(
      cost,
      asset.usefulLifeMonths,
      asset.acquisitionDate,
    );
    return { ...asset, monthlyDepreciation, bookValue };
  }
}

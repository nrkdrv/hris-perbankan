import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetCondition } from '@hris/shared';

export class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  /** Kode kategori aset, mis. IT / KENDARAAN / FURNITURE. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  categoryCode: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  specifications?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  acquisitionCost?: number;

  /** Masa manfaat dalam bulan (untuk penyusutan garis lurus). */
  @IsOptional()
  @IsInt()
  @Min(1)
  usefulLifeMonths?: number;
}

export class UpdateConditionDto {
  @IsEnum(AssetCondition)
  conditionStatus: AssetCondition;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class HandoverDto {
  @IsUUID()
  toUserId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListAssetsQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @IsOptional()
  @IsString()
  q?: string;
}

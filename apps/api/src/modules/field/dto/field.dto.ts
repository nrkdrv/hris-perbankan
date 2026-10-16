import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VisitPurpose } from '@hris/shared';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class CreateCheckpointDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  accuracyM?: number;

  @IsEnum(VisitPurpose, { message: 'visitPurpose tidak valid' })
  visitPurpose!: VisitPurpose;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  clientName?: string;

  @IsString()
  @IsOptional()
  visitNotes?: string;

  @IsString()
  @IsOptional()
  reverseAddress?: string;

  @Transform(toBool)
  @IsOptional()
  isMockDetected?: boolean;
}

/** ?date=YYYY-MM-DD&userId= (userId hanya untuk admin/manager). */
export class CheckpointQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date harus berformat YYYY-MM-DD',
  })
  @IsOptional()
  date?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}

export class PingRequestDto {
  @IsUUID()
  userId!: string;
}

export class LiveLocationDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  accuracyM?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  batteryPct?: number;

  /** Waktu perekaman di perangkat (opsional, default waktu server). */
  @IsISO8601({ strict: true })
  @IsOptional()
  recordedAt?: string;
}

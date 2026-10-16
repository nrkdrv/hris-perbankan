import {
  IsBoolean,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true';

export class ClockLocationDto {
  /** Lintang dari GPS perangkat. */
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  /** Bujur dari GPS perangkat. */
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  /** Akurasi horizontal GPS (meter). */
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100000)
  accuracyM?: number;

  /** ISO timestamp dari perangkat (untuk deteksi time-skew). */
  @IsISO8601({ strict: true })
  clientTimestamp!: string;

  /** Flag mock location dari plugin native APK. */
  @Transform(toBool)
  @IsBoolean()
  isMockDetected!: boolean;

  /** Info perangkat opsional (model, OS, dsb). */
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class ClockInDto extends ClockLocationDto {}

export class ClockOutDto extends ClockLocationDto {}

/** ?month=YYYY-MM untuk riwayat & ekspor. */
export class MonthQueryDto {
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month harus berformat YYYY-MM',
  })
  month!: string;
}

/** ?date=YYYY-MM-DD&branchId= untuk log cabang. */
export class BranchLogsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date harus berformat YYYY-MM-DD',
  })
  date!: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}

/** ?month=YYYY-MM&branchId= untuk ekspor xlsx. */
export class ExportQueryDto extends MonthQueryDto {
  @IsString()
  @IsOptional()
  branchId?: string;
}

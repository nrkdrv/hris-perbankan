import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HolidayType, LeaveType } from '@hris/shared';

// ---------------- Hari libur ----------------

export class CreateHolidayDto {
  @IsDateString({}, { message: 'holidayDate harus tanggal valid (YYYY-MM-DD)' })
  holidayDate!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsEnum(HolidayType)
  type!: HolidayType;
}

export class HolidayQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;
}

// ---------------- Cuti ----------------

export class CreateLeaveDto {
  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate: YYYY-MM-DD' })
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate: YYYY-MM-DD' })
  endDate!: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  attachmentUrl?: string;
}

export class LeaveDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'], {
    message: 'decision harus APPROVED atau REJECTED',
  })
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @IsOptional()
  notes?: string;
}

// ---------------- Kalender terpadu & event ----------------

export class UnifiedQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'month harus berformat YYYY-MM' })
  month!: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class CreateEventDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsISO8601({ strict: true })
  startAt!: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  endAt?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class EventsQueryDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'month harus berformat YYYY-MM' })
  @IsOptional()
  month?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

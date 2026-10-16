import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MaxLength(16)
  branchCode!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  geofenceRadiusM?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedPublicIps?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minTellerQuota?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minCsQuota?: number;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  workStartTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  workEndTime?: string;
}

import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role, WorkLocationType } from '@hris/shared';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jobTitle?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(WorkLocationType)
  workLocationType?: WorkLocationType;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  ptkpStatus?: string;
}

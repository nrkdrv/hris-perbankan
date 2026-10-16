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

export class CreateUserDto {
  @IsString()
  @MaxLength(24)
  nip!: string;

  @IsString()
  @MaxLength(128)
  fullName!: string;

  @IsEmail()
  @MaxLength(128)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jobTitle?: string;

  @IsUUID()
  branchId!: string;

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

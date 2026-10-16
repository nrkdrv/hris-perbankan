import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ArchiveStatus, LetterCategory } from '@hris/shared';

export class GenerateNumberDto {
  @IsEnum(LetterCategory)
  categoryCode: LetterCategory;

  /** Kode entitas/cabang penerbit, mis. KTR-SBY. Maks 16 karakter. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  entityCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  recipient?: string;
}

export class ExpeditionBookQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  entityCode?: string;

  @IsOptional()
  @IsEnum(ArchiveStatus)
  status?: ArchiveStatus;

  @IsOptional()
  @IsString()
  q?: string;
}

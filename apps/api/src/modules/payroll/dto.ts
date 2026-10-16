import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PayrollRowDto {
  @IsUUID()
  userId: string;

  /** Komponen penerimaan: { "Gaji Pokok": 8000000, "Tunjangan Jabatan": 2000000, ... } */
  @IsObject()
  earnings: Record<string, number>;

  @IsOptional()
  @IsNumber()
  loanInstallment?: number;
}

export class SimulatePayrollDto {
  /** Format 'YYYY-MM', mis. '2026-10'. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodMonth harus berformat YYYY-MM' })
  periodMonth: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayrollRowDto)
  rows: PayrollRowDto[];
}

export class PublishPayrollDto extends SimulatePayrollDto {}

export class ImportBatchResultRow {
  userId: string;
  nip: string;
  fullName: string;
  earnings: Record<string, number>;
  loanInstallment: number;
}

export class ImportBatchError {
  /** Nomor baris pada file (1-based, termasuk header). */
  row: number;
  nip?: string;
  message: string;
}

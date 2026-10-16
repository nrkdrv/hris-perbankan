import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  /** ID perangkat opsional untuk device binding. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

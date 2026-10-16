import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Role } from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import {
  BranchLogsQueryDto,
  ClockInDto,
  ClockOutDto,
  ExportQueryDto,
  MonthQueryDto,
} from './dto/clock.dto';

const ALL_ROLES = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.OFFICE_EMPLOYEE,
  Role.FIELD_EMPLOYEE,
  Role.AUDITOR,
];

/** Batas ukuran foto selfie presensi: 5 MB. */
const PHOTO_LIMITS = { fileSize: 5 * 1024 * 1024 };

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Token waktu server bertanda tangan untuk watermark foto. */
  @Post('watermark-token')
  @HttpCode(HttpStatus.OK)
  @Roles(...ALL_ROLES)
  watermarkToken(@CurrentUser() user: AuthUser) {
    return this.attendance.watermarkToken(user);
  }

  @Post('clock-in')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ALL_ROLES)
  @UseInterceptors(FileInterceptor('photo', { limits: PHOTO_LIMITS }))
  clockIn(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockInDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ip() ip: string,
  ) {
    return this.attendance.clockIn(user, dto, file, ip);
  }

  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @Roles(...ALL_ROLES)
  @UseInterceptors(FileInterceptor('photo', { limits: PHOTO_LIMITS }))
  clockOut(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockOutDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ip() ip: string,
  ) {
    return this.attendance.clockOut(user, dto, file, ip);
  }

  /** Riwayat presensi diri. */
  @Get('me')
  @Roles(...ALL_ROLES)
  me(@CurrentUser() user: AuthUser, @Query() q: MonthQueryDto) {
    return this.attendance.myHistory(user, q.month);
  }

  /** Log presensi cabang per tanggal (manager otomatis dibatasi cabangnya). */
  @Get('branch-logs')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  branchLogs(
    @CurrentUser() user: AuthUser,
    @Query() q: BranchLogsQueryDto,
  ) {
    return this.attendance.branchLogs(user, q.date, q.branchId);
  }

  /** Ekspor XLSX presensi bulanan. */
  @Get('export.xlsx')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  exportXlsx(
    @CurrentUser() user: AuthUser,
    @Query() q: ExportQueryDto,
    @Res() res: Response,
  ) {
    return this.attendance.exportXlsx(user, q.month, q.branchId, res);
  }
}

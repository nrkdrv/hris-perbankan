import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FieldService } from './field.service';
import {
  CheckpointQueryDto,
  CreateCheckpointDto,
  LiveLocationDto,
  PingRequestDto,
} from './dto/field.dto';

@Controller('field')
export class FieldController {
  constructor(private readonly field: FieldService) {}

  /** Catat checkpoint kunjungan lapangan (foto + GPS + watermark hash). */
  @Post('checkpoints')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.FIELD_EMPLOYEE, Role.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  createCheckpoint(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckpointDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ip() ip: string,
  ) {
    return this.field.createCheckpoint(user, dto, file, ip);
  }

  /** Riwayat checkpoint (?date=, ?userId= untuk admin/manager). */
  @Get('checkpoints/me')
  @Roles(Role.FIELD_EMPLOYEE, Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  myCheckpoints(
    @CurrentUser() user: AuthUser,
    @Query() q: CheckpointQueryDto,
  ) {
    return this.field.myCheckpoints(user, q);
  }

  /** Picu ping lokasi on-demand via FCM ke karyawan lapangan. */
  @Post('ping-request')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  pingRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: PingRequestDto,
    @Ip() ip: string,
  ) {
    return this.field.pingRequest(user, dto.userId, ip);
  }

  /** Endpoint perangkat: kirim koordinat terkini. */
  @Post('live-locations')
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    Role.SUPER_ADMIN,
    Role.BRANCH_MANAGER,
    Role.OFFICE_EMPLOYEE,
    Role.FIELD_EMPLOYEE,
    Role.AUDITOR,
  )
  submitLiveLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: LiveLocationDto,
    @Ip() ip: string,
  ) {
    return this.field.submitLiveLocation(user, dto, ip);
  }

  /** Peta pantauan: ping terakhir per karyawan lapangan. */
  @Get('live-map')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.AUDITOR)
  liveMap(@CurrentUser() user: AuthUser) {
    return this.field.liveMap(user);
  }
}

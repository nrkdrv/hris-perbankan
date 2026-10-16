import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@hris/shared';
import type { AuthUser } from '../../modules/auth/jwt.strategy';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import {
  CreateEventDto,
  CreateHolidayDto,
  CreateLeaveDto,
  EventsQueryDto,
  HolidayQueryDto,
  LeaveDecisionDto,
  UnifiedQueryDto,
} from './dto/calendar.dto';

const ALL_ROLES = [
  Role.SUPER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.OFFICE_EMPLOYEE,
  Role.FIELD_EMPLOYEE,
  Role.AUDITOR,
];

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  // ---------- hari libur ----------
  @Get('holidays')
  @Roles(...ALL_ROLES)
  holidays(@Query() q: HolidayQueryDto) {
    return this.calendar.listHolidays(q.year);
  }

  @Post('holidays')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN)
  createHoliday(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHolidayDto,
    @Ip() ip: string,
  ) {
    return this.calendar.createHoliday(user, dto, ip);
  }

  @Delete('holidays/:id')
  @Roles(Role.SUPER_ADMIN)
  deleteHoliday(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ) {
    return this.calendar.deleteHoliday(user, id, ip);
  }

  // ---------- kalender terpadu ----------
  @Get('unified')
  @Roles(...ALL_ROLES)
  unified(@CurrentUser() user: AuthUser, @Query() q: UnifiedQueryDto) {
    return this.calendar.unified(user, q);
  }

  // ---------- event manajemen ----------
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  createEvent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEventDto,
    @Ip() ip: string,
  ) {
    return this.calendar.createEvent(user, dto, ip);
  }

  @Get('events')
  @Roles(...ALL_ROLES)
  events(@CurrentUser() user: AuthUser, @Query() q: EventsQueryDto) {
    return this.calendar.listEvents(user, q);
  }
}

@Controller('leaves')
export class LeaveController {
  constructor(private readonly calendar: CalendarService) {}

  /** Ajukan cuti/izin (hitung hari kerja + guardrail kuota). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ALL_ROLES)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveDto,
    @Ip() ip: string,
  ) {
    return this.calendar.createLeave(user, dto, ip);
  }

  /** Riwayat pengajuan cuti diri sendiri. */
  @Get('me')
  @Roles(...ALL_ROLES)
  me(@CurrentUser() user: AuthUser) {
    return this.calendar.myLeaves(user);
  }

  /** Antrean persetujuan (manager: cabangnya saja). */
  @Get('pending-approval')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  pendingApproval(@CurrentUser() user: AuthUser) {
    return this.calendar.pendingApprovals(user);
  }

  /** Setujui / tolak pengajuan. */
  @Patch(':id/decision')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: LeaveDecisionDto,
    @Ip() ip: string,
  ) {
    return this.calendar.decide(user, id, dto, ip);
  }
}

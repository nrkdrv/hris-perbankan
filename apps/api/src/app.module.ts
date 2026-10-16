import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { HealthModule } from './modules/health/health.module';
import { FilesModule } from './modules/files/files.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { FieldModule } from './modules/field/field.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { LettersModule } from './modules/letters/letters.module';
import { AssetsModule } from './modules/assets/assets.module';
import { PayrollModule } from './modules/payroll/payroll.module';

/**
 * Modul fondasi backend + seluruh modul fitur (6 modul PRD).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    HealthModule,
    FilesModule,
    AttendanceModule,
    FieldModule,
    CalendarModule,
    KanbanModule,
    LettersModule,
    AssetsModule,
    PayrollModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

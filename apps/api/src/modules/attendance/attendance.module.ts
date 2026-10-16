import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/**
 * Modul Presensi (geofencing Haversine, anti-fraud, cron ALPHA).
 * Didaftarkan ke AppModule oleh parent. Cron 23:59 WIB membutuhkan
 * ScheduleModule.forRoot() yang terpasang di AppModule.
 */
@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}

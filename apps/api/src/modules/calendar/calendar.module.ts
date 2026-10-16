import { Module } from '@nestjs/common';
import { CalendarController, LeaveController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * Modul Kalender & Cuti: hari libur, pengajuan/persetujuan cuti
 * (guardrail kuota Teller/CS), kalender terpadu, event manajemen.
 * Didaftarkan ke AppModule oleh parent.
 */
@Module({
  controllers: [CalendarController, LeaveController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}

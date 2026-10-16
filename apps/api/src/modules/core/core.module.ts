import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * Modul infra sekali-pasang untuk keempat modul HRIS.
 * Mendaftarkan ScheduleModule.forRoot() tepat SATU kali sehingga
 * @Cron di KanbanService & LettersService ditemukan tanpa duplikasi scheduler.
 *
 * Modul yang butuh cron cukup `imports: [CoreInfraModule]`.
 * PrismaService diasumsikan global (dibuat agen lain).
 */
@Module({
  imports: [ScheduleModule.forRoot()],
})
export class CoreInfraModule {}

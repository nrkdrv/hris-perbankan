import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
import { FieldService } from './field.service';

/**
 * Modul Field Force: checkpoint kunjungan AO, ping lokasi FCM,
 * dan peta pantauan live. Didaftarkan ke AppModule oleh parent.
 */
@Module({
  controllers: [FieldController],
  providers: [FieldService],
  exports: [FieldService],
})
export class FieldModule {}

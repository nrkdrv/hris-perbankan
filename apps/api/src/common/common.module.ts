import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { FcmService } from './services/fcm.service';
import { StorageService } from './services/storage.service';

@Global()
@Module({
  providers: [AuditService, FcmService, StorageService],
  exports: [AuditService, FcmService, StorageService],
})
export class CommonModule {}

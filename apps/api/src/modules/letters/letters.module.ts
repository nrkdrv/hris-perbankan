import { Module } from '@nestjs/common';
import { CoreInfraModule } from '../core/core.module';
import { LettersService } from './letters.service';
import { LettersController } from './letters.controller';

@Module({
  imports: [CoreInfraModule],
  controllers: [LettersController],
  providers: [LettersService],
  exports: [LettersService],
})
export class LettersModule {}

import { Module } from '@nestjs/common';
import { CoreInfraModule } from '../core/core.module';
import { KanbanService } from './kanban.service';
import { KanbanController } from './kanban.controller';

@Module({
  imports: [CoreInfraModule],
  controllers: [KanbanController],
  providers: [KanbanService],
  exports: [KanbanService],
})
export class KanbanModule {}

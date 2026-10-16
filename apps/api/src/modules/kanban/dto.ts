import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { KanbanStage, TaskPriority } from '@hris/shared';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CreateTaskDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class MoveStageDto {
  @IsEnum(KanbanStage)
  stage: KanbanStage;

  /** Wajib bila mengembalikan IN_REVIEW → IN_PROGRESS (revisi). */
  @IsOptional()
  @IsString()
  revisionNotes?: string;
}

export class ReviewTaskDto {
  @IsIn(['APPROVED', 'REQUEST_CHANGES'])
  decision: 'APPROVED' | 'REQUEST_CHANGES';

  /** Wajib bila decision = REQUEST_CHANGES. */
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body: string;
}

export class ListTasksQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(KanbanStage)
  stage?: KanbanStage;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

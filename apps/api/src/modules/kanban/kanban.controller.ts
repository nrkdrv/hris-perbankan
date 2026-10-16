import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@hris/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KanbanService } from './kanban.service';
import {
  CreateCommentDto,
  CreateProjectDto,
  CreateTaskDto,
  ListTasksQueryDto,
  MoveStageDto,
  ReviewTaskDto,
} from './dto';

@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanban: KanbanService) {}

  @Post('projects')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  createProject(@Body() dto: CreateProjectDto, @CurrentUser() user: unknown) {
    return this.kanban.createProject(dto, user);
  }

  @Get('projects')
  listProjects() {
    return this.kanban.listProjects();
  }

  @Post('tasks')
  @Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER)
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: unknown) {
    return this.kanban.createTask(dto, user);
  }

  @Get('tasks')
  listTasks(@Query() query: ListTasksQueryDto) {
    return this.kanban.listTasks(query);
  }

  @Get('tasks/:id')
  getTask(@Param('id') id: string) {
    return this.kanban.getTask(id);
  }

  @Patch('tasks/:id/stage')
  moveStage(@Param('id') id: string, @Body() dto: MoveStageDto, @CurrentUser() user: unknown) {
    return this.kanban.moveStage(id, dto, user);
  }

  @Post('tasks/:id/review')
  reviewTask(@Param('id') id: string, @Body() dto: ReviewTaskDto, @CurrentUser() user: unknown) {
    return this.kanban.reviewTask(id, dto, user);
  }

  @Post('tasks/:id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: unknown,
  ) {
    return this.kanban.addAttachments(id, files, user);
  }

  @Get('tasks/:id/comments')
  listComments(@Param('id') id: string) {
    return this.kanban.listComments(id);
  }

  @Post('tasks/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: unknown,
  ) {
    return this.kanban.addComment(id, dto, user);
  }
}

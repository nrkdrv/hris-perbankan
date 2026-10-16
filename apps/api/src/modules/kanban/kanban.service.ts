import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KanbanStage } from '@hris/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { StorageService } from '../../common/services/storage.service';
import { FcmService } from '../../common/services/fcm.service';
import { notifySafe } from '../core/notify.util';
import { isPrivileged, requestUser } from '../core/request-user';
import { assertStageTransition, StageTransitionError } from './kanban-transitions';
import {
  CreateCommentDto,
  CreateProjectDto,
  CreateTaskDto,
  ListTasksQueryDto,
  MoveStageDto,
  ReviewTaskDto,
} from './dto';

const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true, nip: true } },
  reviewer: { select: { id: true, fullName: true, nip: true } },
} as const;

@Injectable()
export class KanbanService {
  private readonly logger = new Logger(KanbanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly fcm: FcmService,
  ) {}

  // ---------- Projects ----------

  async createProject(dto: CreateProjectDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
      if (!branch) throw new NotFoundException('Cabang tidak ditemukan');
    }
    const project = await this.prisma.kanbanProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        branchId: dto.branchId,
        ownerId: actor.id,
      },
    });
    await this.audit.log(actor.id, 'KANBAN_PROJECT_CREATE', 'KanbanProject', project.id, {
      newValues: { name: dto.name, branchId: dto.branchId ?? null },
    });
    return project;
  }

  listProjects() {
    return this.prisma.kanbanProject.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
  }

  // ---------- Tasks ----------

  async createTask(dto: CreateTaskDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const project = await this.prisma.kanbanProject.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan');

    for (const [label, id] of [
      ['Assignee', dto.assigneeId],
      ['Reviewer', dto.reviewerId],
    ] as const) {
      if (id) {
        const u = await this.prisma.user.findUnique({ where: { id } });
        if (!u) throw new NotFoundException(`${label} tidak ditemukan`);
      }
    }

    const task = await this.prisma.kanbanTask.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        reviewerId: dto.reviewerId,
        priority: dto.priority ?? 'MEDIUM',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: TASK_INCLUDE,
    });
    await this.audit.log(actor.id, 'KANBAN_TASK_CREATE', 'KanbanTask', task.id, {
      newValues: { title: dto.title, projectId: dto.projectId, assigneeId: dto.assigneeId ?? null },
    });
    if (task.assigneeId && task.assigneeId !== actor.id) {
      await notifySafe(this.fcm, task.assigneeId, 'Tugas baru untuk Anda', `"${task.title}" ditugaskan kepada Anda`, {
        taskId: task.id,
      });
    }
    return task;
  }

  listTasks(query: ListTasksQueryDto) {
    return this.prisma.kanbanTask.findMany({
      where: {
        projectId: query.projectId,
        stage: query.stage,
        assigneeId: query.assigneeId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: TASK_INCLUDE,
    });
  }

  async getTask(id: string) {
    const task = await this.prisma.kanbanTask.findUnique({
      where: { id },
      include: {
        ...TASK_INCLUDE,
        verifier: { select: { id: true, fullName: true, nip: true } },
      },
    });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');
    return task;
  }

  /** Pindah tahap sesuai state machine ketat. Melempar 403 / 422 bila melanggar. */
  async moveStage(taskId: string, dto: MoveStageDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const task = await this.prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');

    try {
      assertStageTransition(
        {
          stage: task.stage as KanbanStage,
          assigneeId: task.assigneeId,
          reviewerId: task.reviewerId,
          attachmentUrls: task.attachmentUrls,
        },
        { id: actor.id, role: actor.role },
        dto.stage,
        dto.revisionNotes,
      );
    } catch (e) {
      if (e instanceof StageTransitionError) {
        if (e.status === 403) throw new ForbiddenException(e.message);
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }

    const from = task.stage as KanbanStage;
    const data: Record<string, unknown> = { stage: dto.stage };
    if (from === KanbanStage.TODO && dto.stage === KanbanStage.IN_PROGRESS) {
      data['startedAt'] = new Date();
    }
    if (dto.stage === KanbanStage.DONE) {
      data['verifiedBy'] = actor.id;
    }
    if (from === KanbanStage.IN_REVIEW && dto.stage === KanbanStage.IN_PROGRESS) {
      data['revisionNotes'] = dto.revisionNotes;
    }

    const updated = await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data,
      include: TASK_INCLUDE,
    });
    await this.audit.log(actor.id, 'KANBAN_STAGE_MOVE', 'KanbanTask', taskId, {
      oldValues: { stage: from },
      newValues: { stage: dto.stage },
    });

    const targets = new Set<string>();
    if (updated.assigneeId && updated.assigneeId !== actor.id) targets.add(updated.assigneeId);
    if (updated.reviewerId && updated.reviewerId !== actor.id) targets.add(updated.reviewerId);
    for (const target of targets) {
      await notifySafe(
        this.fcm,
        target,
        'Tugas Kanban berpindah tahap',
        `"${updated.title}" kini ${dto.stage}`,
        { taskId },
      );
    }
    return updated;
  }

  /** Review checker: APPROVED ≡ DONE, REQUEST_CHANGES ≡ kembali IN_PROGRESS + revisionNotes. */
  async reviewTask(taskId: string, dto: ReviewTaskDto, actorRaw: unknown) {
    const task = await this.prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');
    if ((task.stage as KanbanStage) !== KanbanStage.IN_REVIEW) {
      throw new UnprocessableEntityException('Hanya tugas pada tahap IN_REVIEW yang dapat direview');
    }
    if (dto.decision === 'APPROVED') {
      return this.moveStage(taskId, { stage: KanbanStage.DONE }, actorRaw);
    }
    if (!dto.notes || !dto.notes.trim()) {
      throw new UnprocessableEntityException(
        'notes (catatan revisi) wajib diisi bila decision = REQUEST_CHANGES',
      );
    }
    return this.moveStage(
      taskId,
      { stage: KanbanStage.IN_PROGRESS, revisionNotes: dto.notes },
      actorRaw,
    );
  }

  async addAttachments(taskId: string, files: Express.Multer.File[], actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const task = await this.prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');
    const isAssignee = task.assigneeId != null && task.assigneeId === actor.id;
    if (!isAssignee && !isPrivileged(actor.role)) {
      throw new ForbiddenException('Hanya assignee tugas atau pimpinan yang dapat mengunggah lampiran');
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('Tidak ada file yang diunggah (field: files[])');
    }

    const keys: string[] = [];
    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `kanban/${taskId}/${Date.now()}-${safeName}`;
      await this.storage.save(file.buffer, key, file.mimetype);
      keys.push(key);
    }
    const updated = await this.prisma.kanbanTask.update({
      where: { id: taskId },
      data: { attachmentUrls: [...task.attachmentUrls, ...keys] },
    });
    await this.audit.log(actor.id, 'KANBAN_ATTACH', 'KanbanTask', taskId, {
      newValues: { addedAttachments: keys },
    });
    return updated;
  }

  // ---------- Comments ----------

  async listComments(taskId: string) {
    const task = await this.prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');
    return this.prisma.kanbanComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true, nip: true } } },
    });
  }

  async addComment(taskId: string, dto: CreateCommentDto, actorRaw: unknown) {
    const actor = requestUser(actorRaw);
    const task = await this.prisma.kanbanTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Tugas tidak ditemukan');
    const comment = await this.prisma.kanbanComment.create({
      data: { taskId, authorId: actor.id, body: dto.body },
      include: { author: { select: { id: true, fullName: true, nip: true } } },
    });
    await this.audit.log(actor.id, 'KANBAN_COMMENT', 'KanbanComment', comment.id, {
      newValues: { taskId },
    });
    return comment;
  }

  // ---------- Cron: pengingat H-1 deadline (tiap jam) ----------

  @Cron('0 * * * *')
  async handleH1Reminders() {
    try {
      const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tasks = await this.prisma.kanbanTask.findMany({
        where: {
          stage: { not: KanbanStage.DONE },
          dueAt: { lte: in24h },
          h1Notified: false,
        },
        include: { assignee: { select: { id: true } } },
      });
      for (const task of tasks) {
        await notifySafe(
          this.fcm,
          task.assigneeId,
          'Deadline tugas H-1',
          `"${task.title}" tenggat ${task.dueAt?.toISOString().slice(0, 16).replace('T', ' ')}`,
          { taskId: task.id },
        );
        await this.prisma.kanbanTask.update({
          where: { id: task.id },
          data: { h1Notified: true },
        });
      }
      if (tasks.length > 0) this.logger.log(`H-1 reminder dikirim untuk ${tasks.length} tugas`);
    } catch (err) {
      this.logger.error(`Gagal menjalankan H-1 reminder: ${(err as Error).message}`);
    }
  }

  // ---------- Cron: eskalasi overdue (tiap 08:00 WIB) ----------

  @Cron('0 8 * * *', { timeZone: 'Asia/Jakarta' })
  async handleOverdueEscalation() {
    try {
      const now = new Date();
      const tasks = await this.prisma.kanbanTask.findMany({
        where: {
          stage: { not: KanbanStage.DONE },
          dueAt: { lt: now },
        },
      });
      for (const task of tasks) {
        const targets = new Set<string>();
        if (task.assigneeId) targets.add(task.assigneeId);
        if (task.reviewerId) targets.add(task.reviewerId);
        for (const target of targets) {
          await notifySafe(
            this.fcm,
            target,
            'Tugas melewati deadline',
            `"${task.title}" sudah melewati tenggat dan belum selesai`,
            { taskId: task.id },
          );
        }
      }
      if (tasks.length > 0) this.logger.log(`Overdue escalation untuk ${tasks.length} tugas`);
    } catch (err) {
      this.logger.error(`Gagal menjalankan overdue escalation: ${(err as Error).message}`);
    }
  }
}

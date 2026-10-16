import { KanbanStage, Role } from '@hris/shared';

export interface TransitionTaskState {
  stage: KanbanStage;
  assigneeId: string | null;
  reviewerId: string | null;
  attachmentUrls: string[];
}

export interface TransitionActor {
  id: string;
  role: Role;
}

/** Error domain state machine: diterjemahkan service menjadi 403 / 422. */
export class StageTransitionError extends Error {
  constructor(
    public readonly status: 403 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'StageTransitionError';
  }
}

function isManager(role: Role): boolean {
  return role === Role.SUPER_ADMIN || role === Role.BRANCH_MANAGER;
}

/**
 * Validasi state machine Kanban 4 tahap dengan gate maker-checker perbankan:
 * - TODO → IN_PROGRESS      : assignee / SUPER_ADMIN / BRANCH_MANAGER (set startedAt)
 * - IN_PROGRESS → IN_REVIEW : assignee / manajer, WAJIB ada lampiran bukti kerja
 * - IN_REVIEW → DONE        : HANYA reviewer tugas / manajer (maker-checker gate)
 * - IN_REVIEW → IN_PROGRESS : reviewer / manajer, WAJIB revisionNotes
 * - lainnya → 422
 */
export function assertStageTransition(
  task: TransitionTaskState,
  actor: TransitionActor,
  to: KanbanStage,
  revisionNotes?: string,
): void {
  const from = task.stage;
  if (from === to) {
    throw new StageTransitionError(422, `Tugas sudah berada di tahap ${from}`);
  }
  const isAssignee = task.assigneeId != null && actor.id === task.assigneeId;
  const isReviewer = task.reviewerId != null && actor.id === task.reviewerId;
  const privileged = isManager(actor.role);

  switch (from) {
    case KanbanStage.TODO: {
      if (to !== KanbanStage.IN_PROGRESS) {
        throw new StageTransitionError(422, `Transisi ${from} → ${to} tidak diizinkan`);
      }
      if (!isAssignee && !privileged) {
        throw new StageTransitionError(
          403,
          'Hanya assignee tugas atau pimpinan yang dapat memulai pengerjaan',
        );
      }
      return;
    }
    case KanbanStage.IN_PROGRESS: {
      if (to !== KanbanStage.IN_REVIEW) {
        throw new StageTransitionError(422, `Transisi ${from} → ${to} tidak diizinkan`);
      }
      if (!isAssignee && !privileged) {
        throw new StageTransitionError(
          403,
          'Hanya assignee tugas atau pimpinan yang dapat mengajukan review',
        );
      }
      if (!task.attachmentUrls || task.attachmentUrls.length === 0) {
        throw new StageTransitionError(
          422,
          'Tugas wajib memiliki minimal satu lampiran bukti kerja sebelum masuk In Review',
        );
      }
      return;
    }
    case KanbanStage.IN_REVIEW: {
      if (to === KanbanStage.DONE) {
        if (!isReviewer && !privileged) {
          throw new StageTransitionError(
            403,
            'Hanya reviewer tugas / pimpinan (checker) yang dapat menandai tugas DONE',
          );
        }
        return;
      }
      if (to === KanbanStage.IN_PROGRESS) {
        if (!isReviewer && !privileged) {
          throw new StageTransitionError(
            403,
            'Hanya reviewer / pimpinan yang dapat mengembalikan tugas untuk revisi',
          );
        }
        if (!revisionNotes || !revisionNotes.trim()) {
          throw new StageTransitionError(
            422,
            'revisionNotes wajib diisi saat mengembalikan tugas untuk revisi',
          );
        }
        return;
      }
      throw new StageTransitionError(422, `Transisi ${from} → ${to} tidak diizinkan`);
    }
    case KanbanStage.DONE:
    default: {
      throw new StageTransitionError(422, 'Tugas yang sudah DONE tidak dapat dipindahkan lagi');
    }
  }
}

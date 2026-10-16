import { describe, expect, it } from 'vitest';
import { KanbanStage, Role } from '@hris/shared';
import {
  assertStageTransition,
  StageTransitionError,
  type TransitionActor,
  type TransitionTaskState,
} from './kanban-transitions';

const ASSIGNEE: TransitionActor = { id: 'user-assignee', role: Role.OFFICE_EMPLOYEE };
const REVIEWER: TransitionActor = { id: 'user-reviewer', role: Role.BRANCH_MANAGER };
const MANAGER: TransitionActor = { id: 'user-manager', role: Role.BRANCH_MANAGER };
const SUPER: TransitionActor = { id: 'user-super', role: Role.SUPER_ADMIN };
const OTHER: TransitionActor = { id: 'user-other', role: Role.OFFICE_EMPLOYEE };

function task(stage: KanbanStage, overrides: Partial<TransitionTaskState> = {}): TransitionTaskState {
  return {
    stage,
    assigneeId: 'user-assignee',
    reviewerId: 'user-reviewer',
    attachmentUrls: [],
    ...overrides,
  };
}

function expectError(
  fn: () => void,
  status: 403 | 422,
) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(StageTransitionError);
    expect((e as StageTransitionError).status).toBe(status);
    return;
  }
  throw new Error('Seharusnya melempar StageTransitionError');
}

describe('state machine kanban', () => {
  it('TODO → IN_PROGRESS: assignee boleh', () => {
    expect(() => assertStageTransition(task(KanbanStage.TODO), ASSIGNEE, KanbanStage.IN_PROGRESS)).not.toThrow();
  });

  it('TODO → IN_PROGRESS: BRANCH_MANAGER & SUPER_ADMIN boleh', () => {
    expect(() => assertStageTransition(task(KanbanStage.TODO), MANAGER, KanbanStage.IN_PROGRESS)).not.toThrow();
    expect(() => assertStageTransition(task(KanbanStage.TODO), SUPER, KanbanStage.IN_PROGRESS)).not.toThrow();
  });

  it('TODO → IN_PROGRESS: karyawan lain (bukan assignee) → 403', () => {
    expectError(() => assertStageTransition(task(KanbanStage.TODO), OTHER, KanbanStage.IN_PROGRESS), 403);
  });

  it('TODO → DONE langsung → 422', () => {
    expectError(() => assertStageTransition(task(KanbanStage.TODO), ASSIGNEE, KanbanStage.DONE), 422);
  });

  it('IN_PROGRESS → IN_REVIEW tanpa lampiran → 422', () => {
    expectError(
      () => assertStageTransition(task(KanbanStage.IN_PROGRESS), ASSIGNEE, KanbanStage.IN_REVIEW),
      422,
    );
  });

  it('IN_PROGRESS → IN_REVIEW dengan lampiran → ok (assignee)', () => {
    const t = task(KanbanStage.IN_PROGRESS, { attachmentUrls: ['kanban/x/foto.jpg'] });
    expect(() => assertStageTransition(t, ASSIGNEE, KanbanStage.IN_REVIEW)).not.toThrow();
  });

  it('IN_PROGRESS → IN_REVIEW oleh karyawan lain → 403', () => {
    const t = task(KanbanStage.IN_PROGRESS, { attachmentUrls: ['kanban/x/foto.jpg'] });
    expectError(() => assertStageTransition(t, OTHER, KanbanStage.IN_REVIEW), 403);
  });

  it('IN_REVIEW → DONE: hanya reviewer / manajer; assignee biasa → 403', () => {
    const t = task(KanbanStage.IN_REVIEW, { attachmentUrls: ['a'] });
    expect(() => assertStageTransition(t, REVIEWER, KanbanStage.DONE)).not.toThrow();
    expect(() => assertStageTransition(t, SUPER, KanbanStage.DONE)).not.toThrow();
    expectError(() => assertStageTransition(t, { id: 'user-assignee', role: Role.OFFICE_EMPLOYEE }, KanbanStage.DONE), 403);
  });

  it('IN_REVIEW → IN_PROGRESS wajib revisionNotes', () => {
    const t = task(KanbanStage.IN_REVIEW, { attachmentUrls: ['a'] });
    expectError(() => assertStageTransition(t, REVIEWER, KanbanStage.IN_PROGRESS), 422);
    expect(() =>
      assertStageTransition(t, REVIEWER, KanbanStage.IN_PROGRESS, 'Perbaiki angka tabel 3'),
    ).not.toThrow();
  });

  it('IN_REVIEW → IN_PROGRESS oleh assignee (bukan reviewer) → 403', () => {
    const t = task(KanbanStage.IN_REVIEW, { attachmentUrls: ['a'] });
    expectError(
      () => assertStageTransition(t, ASSIGNEE, KanbanStage.IN_PROGRESS, 'revisi'),
      403,
    );
  });

  it('DONE → tahap manapun → 422', () => {
    const t = task(KanbanStage.DONE, { attachmentUrls: ['a'] });
    expectError(() => assertStageTransition(t, SUPER, KanbanStage.IN_PROGRESS), 422);
  });

  it('transisi ke tahap yang sama → 422', () => {
    expectError(
      () => assertStageTransition(task(KanbanStage.TODO), ASSIGNEE, KanbanStage.TODO),
      422,
    );
  });
});

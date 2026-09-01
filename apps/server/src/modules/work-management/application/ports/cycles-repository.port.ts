import type { WorkspaceRole } from '../../../iam/domain/workspace-membership';
import type { Cycle, CycleProgress } from '../../domain/cycle';

export const CYCLES_REPOSITORY = Symbol('CYCLES_REPOSITORY');

export interface CycleWithDetails extends Cycle {
  progress: CycleProgress;
}

export interface CycleAccess {
  cycle: Cycle;
  role: WorkspaceRole;
}

export interface UpdateCycleInput {
  cycleId: string;
  actorUserId: string;
  changes: {
    name?: string | undefined;
  };
  updatedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type UpdateCycleResult =
  | { type: 'updated'; cycle: CycleWithDetails }
  | { type: 'unchanged'; cycle: CycleWithDetails }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface CompleteCycleInput {
  cycleId: string;
  actorUserId: string;
  completedAt: Date;
  idempotencyKey?: string | null | undefined;
}

export type CompleteCycleResult =
  | {
      type: 'completed';
      cycle: CycleWithDetails;
      rolledOverCount: number;
      nextCycleId: string | null;
    }
  | { type: 'already_completed'; cycle: CycleWithDetails }
  | { type: 'forbidden' }
  | { type: 'not_found' };

export interface CyclesRepository {
  list(teamId: string): Promise<CycleWithDetails[]>;
  findById(cycleId: string): Promise<CycleWithDetails | null>;
  findAccess(cycleId: string, userId: string): Promise<CycleAccess | null>;
  update(input: UpdateCycleInput): Promise<UpdateCycleResult>;
  complete(input: CompleteCycleInput): Promise<CompleteCycleResult>;
  syncUpcomingCycles(teamId: string, referenceDate?: Date): Promise<Cycle[]>;
}

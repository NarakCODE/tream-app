import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import type { Cycle } from '../domain/cycle';
import {
  CYCLES_REPOSITORY,
  type CyclesRepository,
  type CycleWithDetails,
} from './ports/cycles-repository.port';

export interface UpdateCycleCommand {
  name?: string;
}

@Injectable()
export class CyclesService {
  constructor(
    @Inject(CYCLES_REPOSITORY)
    private readonly repository: CyclesRepository,
  ) {}

  async list(teamId: string): Promise<CycleWithDetails[]> {
    return this.repository.list(teamId);
  }

  async findById(cycleId: string): Promise<CycleWithDetails> {
    const cycle = await this.repository.findById(cycleId);
    if (!cycle) {
      throw this.forbidden();
    }
    return cycle;
  }

  async update(
    cycleId: string,
    actorUserId: string,
    input: UpdateCycleCommand,
  ): Promise<CycleWithDetails> {
    const result = await this.repository.update({
      cycleId,
      actorUserId,
      changes: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
      },
      updatedAt: new Date(),
    });

    if (result.type === 'updated' || result.type === 'unchanged') {
      return result.cycle;
    }
    throw this.forbidden();
  }

  async complete(
    cycleId: string,
    actorUserId: string,
  ): Promise<CycleWithDetails> {
    const result = await this.repository.complete({
      cycleId,
      actorUserId,
      completedAt: new Date(),
    });

    if (result.type === 'completed' || result.type === 'already_completed') {
      return result.cycle;
    }
    throw this.forbidden();
  }

  async syncUpcomingCycles(
    teamId: string,
    referenceDate: Date = new Date(),
  ): Promise<Cycle[]> {
    return this.repository.syncUpcomingCycles(teamId, referenceDate);
  }

  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this cycle resource.',
      HttpStatus.FORBIDDEN,
    );
  }
}

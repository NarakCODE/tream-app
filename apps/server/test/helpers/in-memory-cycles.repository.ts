import { ulid } from 'ulid';
import type {
  CompleteCycleInput,
  CompleteCycleResult,
  CycleAccess,
  CyclesRepository,
  CycleWithDetails,
  UpdateCycleInput,
  UpdateCycleResult,
} from '../../src/modules/work-management/application/ports/cycles-repository.port';
import { calculateNextCycles } from '../../src/modules/work-management/domain/cycle-calculator';
import {
  calculateCycleProgress,
  type Cycle,
} from '../../src/modules/work-management/domain/cycle';
import { shouldRollOverToNextCycle } from '../../src/modules/work-management/domain/issue';
import { canWriteWorkManagement } from '../../src/modules/work-management/domain/work-management-roles';
import type { InMemoryWorkspaceRepository } from './in-memory-workspace.repository';
import type { InMemoryTeamsRepository } from './in-memory-teams.repository';
import type { InMemoryIssuesRepository } from './in-memory-issues.repository';

export class InMemoryCyclesRepository implements CyclesRepository {
  public readonly cycles = new Map<string, Cycle>();
  private issuesRepository?: InMemoryIssuesRepository;

  constructor(
    private readonly workspaceRepository: InMemoryWorkspaceRepository,
    private readonly teamsRepository: InMemoryTeamsRepository,
  ) {}

  setIssuesRepository(repo: InMemoryIssuesRepository): void {
    this.issuesRepository = repo;
  }

  reset(): void {
    this.cycles.clear();
  }

  list(teamId: string): Promise<CycleWithDetails[]> {
    const list = [...this.cycles.values()]
      .filter((c) => c.teamId === teamId)
      .sort((a, b) => a.number - b.number);

    return Promise.resolve(list.map((c) => this.hydrateDetails(c)));
  }

  findById(cycleId: string): Promise<CycleWithDetails | null> {
    const cycle = this.cycles.get(cycleId);
    if (!cycle) return Promise.resolve(null);
    return Promise.resolve(this.hydrateDetails(cycle));
  }

  async findAccess(
    cycleId: string,
    userId: string,
  ): Promise<CycleAccess | null> {
    const cycle = this.cycles.get(cycleId);
    if (!cycle) return null;

    const team = this.teamsRepository.teams.get(cycle.teamId);
    if (!team) return null;

    const access = await this.workspaceRepository.findActiveWorkspaceMembership(
      team.workspaceId,
      userId,
    );
    if (!access) return null;

    return { cycle, role: access.membership.role };
  }

  async update(input: UpdateCycleInput): Promise<UpdateCycleResult> {
    const access = await this.findAccess(input.cycleId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    const updated: Cycle = {
      ...access.cycle,
      ...(input.changes.name !== undefined ? { name: input.changes.name } : {}),
      updatedAt: input.updatedAt,
    };
    this.cycles.set(updated.id, updated);

    const details = this.hydrateDetails(updated);
    return { type: 'updated', cycle: details };
  }

  async complete(input: CompleteCycleInput): Promise<CompleteCycleResult> {
    const access = await this.findAccess(input.cycleId, input.actorUserId);
    if (!access) return { type: 'not_found' };
    if (!canWriteWorkManagement(access.role)) return { type: 'forbidden' };

    if (access.cycle.completedAt !== null) {
      const details = this.hydrateDetails(access.cycle);
      return { type: 'already_completed', cycle: details };
    }

    const team = this.teamsRepository.teams.get(access.cycle.teamId);
    if (!team) return { type: 'not_found' };

    const updated: Cycle = {
      ...access.cycle,
      completedAt: input.completedAt,
      updatedAt: input.completedAt,
    };
    this.cycles.set(updated.id, updated);

    const allCycles = [...this.cycles.values()]
      .filter((c) => c.teamId === team.id)
      .sort((a, b) => a.number - b.number);

    let nextCycle = allCycles.find(
      (c) => c.number > access.cycle.number && c.completedAt === null,
    );

    if (!nextCycle && team.cyclesEnabled) {
      const drafts = calculateNextCycles(team, allCycles, input.completedAt);
      if (drafts.length > 0 && drafts[0]) {
        const d = drafts[0];
        const newCycle: Cycle = {
          id: `cyc_${ulid()}`,
          teamId: team.id,
          number: d.number,
          name: d.name,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          completedAt: null,
          createdAt: input.completedAt,
          updatedAt: input.completedAt,
        };
        this.cycles.set(newCycle.id, newCycle);
        nextCycle = newCycle;
      }
    }

    let rolledOverCount = 0;
    if (nextCycle && this.issuesRepository) {
      const cycleIssues = [...this.issuesRepository.issues.values()].filter(
        (i) => i.cycleId === access.cycle.id && i.deletedAt === null,
      );

      for (const issue of cycleIssues) {
        const status = this.teamsRepository.statuses.get(issue.statusId);
        if (status && shouldRollOverToNextCycle(status.category)) {
          const updatedIssue = {
            ...issue,
            cycleId: nextCycle.id,
            updatedAt: input.completedAt,
          };
          this.issuesRepository.issues.set(updatedIssue.id, updatedIssue);
          rolledOverCount += 1;
        }
      }
    }

    const details = this.hydrateDetails(updated);
    return {
      type: 'completed',
      cycle: details,
      rolledOverCount,
      nextCycleId: nextCycle ? nextCycle.id : null,
    };
  }

  syncUpcomingCycles(
    teamId: string,
    referenceDate: Date = new Date(),
  ): Promise<Cycle[]> {
    const team = this.teamsRepository.teams.get(teamId);
    if (!team || !team.cyclesEnabled) return Promise.resolve([]);

    const allCycles = [...this.cycles.values()]
      .filter((c) => c.teamId === teamId)
      .sort((a, b) => a.number - b.number);

    const drafts = calculateNextCycles(team, allCycles, referenceDate);
    const inserted: Cycle[] = [];
    for (const d of drafts) {
      const c: Cycle = {
        id: `cyc_${ulid()}`,
        teamId: team.id,
        number: d.number,
        name: d.name,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        completedAt: null,
        createdAt: referenceDate,
        updatedAt: referenceDate,
      };
      this.cycles.set(c.id, c);
      inserted.push(c);
    }
    return Promise.resolve([...allCycles, ...inserted]);
  }

  private hydrateDetails(cycle: Cycle): CycleWithDetails {
    let totalIssues = 0;
    let completedIssues = 0;
    if (this.issuesRepository) {
      const issues = [...this.issuesRepository.issues.values()].filter(
        (i) => i.cycleId === cycle.id && i.deletedAt === null,
      );
      totalIssues = issues.length;
      completedIssues = issues.filter((i) => {
        const s = this.teamsRepository.statuses.get(i.statusId);
        return s?.category === 'COMPLETED';
      }).length;
    }

    return {
      ...cycle,
      progress: calculateCycleProgress(totalIssues, completedIssues),
    };
  }
}

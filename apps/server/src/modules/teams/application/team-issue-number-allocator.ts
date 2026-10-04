import { ConflictException, Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../database/transaction';
import { TeamAccessService } from './team-access.service';
import { TeamRepository } from '../infrastructure/team.repository';
@Injectable()
export class TeamIssueNumberAllocator {
  constructor(
    private readonly access: TeamAccessService,
    private readonly repository: TeamRepository,
  ) {}
  async allocate(
    tx: DatabaseTransaction,
    userId: string,
    workspaceId: string,
    teamId: string,
  ) {
    const { team } = await this.access.require(
      tx,
      userId,
      workspaceId,
      teamId,
      'write',
      true,
    );
    const defaults = (await this.repository.statuses(tx, teamId)).filter(
      (x) => x.isDefault && ['BACKLOG', 'UNSTARTED'].includes(x.category),
    );
    if (defaults.length !== 1)
      throw new ConflictException('Team requires exactly one usable default.');
    if (team.nextIssueNumber >= 2147483647)
      throw new ConflictException('Team issue-number capacity reached.');
    const number = await this.repository.increment(tx, teamId);
    return {
      number,
      identifier: `${team.key}-${number}`,
      defaultStatusId: defaults[0]!.id,
    };
  }
}

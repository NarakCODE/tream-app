import { ConflictException } from '@nestjs/common';
import { TeamStatusService } from './team-status.service';
import { TeamRepository } from '../infrastructure/team.repository';
import { TeamCommandService } from './team-command.service';
import { TeamAccessService } from './team-access.service';
import { DatabaseService } from '../../../database/database.service';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('Status catalog invariants', () => {
  const identity = {} as IdempotencyReservationInput,
    tx = {} as DatabaseTransaction;
  let repository: {
      statuses: jest.Mock;
      statusUsage: jest.Mock;
      updateStatus: jest.Mock;
      replaceStatus: jest.Mock;
      reorder: jest.Mock;
    },
    commands: { execute: jest.Mock; fact: jest.Mock },
    service: TeamStatusService;
  beforeEach(() => {
    repository = {
      statuses: jest.fn().mockResolvedValue([
        { id: 'todo', category: 'UNSTARTED', isDefault: true },
        { id: 'done', category: 'COMPLETED', isDefault: false },
      ]),
      statusUsage: jest.fn().mockResolvedValue(0),
      updateStatus: jest.fn().mockResolvedValue({ id: 'done' }),
      replaceStatus: jest.fn().mockResolvedValue([]),
      reorder: jest.fn().mockResolvedValue(undefined),
    };
    commands = {
      execute: jest
        .fn()
        .mockImplementation(
          (
            _identity: unknown,
            _workspace: string,
            _team: string,
            handler: (
              tx: DatabaseTransaction,
              actorId: string,
            ) => Promise<unknown>,
          ) => handler(tx, 'actor'),
        ),
      fact: jest.fn().mockResolvedValue(undefined),
    };
    service = new TeamStatusService(
      {} as DatabaseService,
      repository as unknown as TeamRepository,
      {} as TeamAccessService,
      commands as unknown as TeamCommandService,
    );
  });
  it('rejects terminal defaults without mutating the catalog', async () => {
    await expect(
      service.setDefault(identity, 'w', 't', 'done'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
  it('does not retire a used status without an explicit replacement', async () => {
    repository.statusUsage.mockResolvedValue(2);
    await expect(service.retire(identity, 'w', 't', 'done')).rejects.toThrow(
      'explicit replacement',
    );
    expect(repository.replaceStatus).not.toHaveBeenCalled();
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
  it('does not silently move issue categories', async () => {
    repository.statusUsage.mockResolvedValue(1);
    await expect(
      service.update(identity, 'w', 't', 'done', { category: 'UNSTARTED' }),
    ).rejects.toThrow('In-use status category');
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
  it('publishes an individual issue fact for each explicit reassignment', async () => {
    repository.replaceStatus.mockResolvedValue([
      { id: 'issue1' },
      { id: 'issue2' },
    ]);
    await service.retire(identity, 'w', 't', 'done', 'todo');
    expect(commands.fact).toHaveBeenCalledWith(
      tx,
      'w',
      'actor',
      't',
      'issue.status_changed',
      { issue_id: 'issue1', previous_status_id: 'done', status_id: 'todo' },
      'issue',
      'issue1',
    );
    expect(commands.fact).toHaveBeenCalledWith(
      tx,
      'w',
      'actor',
      't',
      'issue.status_changed',
      { issue_id: 'issue2', previous_status_id: 'done', status_id: 'todo' },
      'issue',
      'issue2',
    );
  });
  it('rejects partial reorder instructions without touching positions', async () => {
    await expect(service.reorder(identity, 'w', 't', ['todo'])).rejects.toThrow(
      'every active status',
    );
    expect(repository.reorder).not.toHaveBeenCalled();
  });
});

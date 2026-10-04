import { TeamIssueNumberAllocator } from './team-issue-number-allocator';
import { TeamAccessService } from './team-access.service';
import { TeamRepository } from '../infrastructure/team.repository';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('Team issue-number reservation', () => {
  const tx = {} as DatabaseTransaction;
  let access: { require: jest.Mock },
    repo: { statuses: jest.Mock; increment: jest.Mock },
    allocator: TeamIssueNumberAllocator;
  beforeEach(() => {
    access = {
      require: jest
        .fn()
        .mockResolvedValue({ team: { key: 'ENG', nextIssueNumber: 7 } }),
    };
    repo = {
      statuses: jest
        .fn()
        .mockResolvedValue([
          { id: 'todo', category: 'UNSTARTED', isDefault: true },
        ]),
      increment: jest.fn().mockResolvedValue(7),
    };
    allocator = new TeamIssueNumberAllocator(
      access as unknown as TeamAccessService,
      repo as unknown as TeamRepository,
    );
  });
  it('authorizes and reserves within the caller transaction', async () => {
    await expect(allocator.allocate(tx, 'u', 'w', 't')).resolves.toEqual({
      number: 7,
      identifier: 'ENG-7',
      defaultStatusId: 'todo',
    });
    expect(access.require).toHaveBeenCalledWith(
      tx,
      'u',
      'w',
      't',
      'write',
      true,
    );
    expect(repo.increment).toHaveBeenCalledWith(tx, 't');
  });
  it('never advances a counter without a usable default', async () => {
    repo.statuses.mockResolvedValue([
      { id: 'done', category: 'COMPLETED', isDefault: true },
    ]);
    await expect(allocator.allocate(tx, 'u', 'w', 't')).rejects.toThrow(
      'usable default',
    );
    expect(repo.increment).not.toHaveBeenCalled();
  });
  it('rejects integer exhaustion before mutation', async () => {
    access.require.mockResolvedValue({
      team: { key: 'ENG', nextIssueNumber: 2147483647 },
    });
    await expect(allocator.allocate(tx, 'u', 'w', 't')).rejects.toThrow(
      'capacity',
    );
    expect(repo.increment).not.toHaveBeenCalled();
  });
});

import { IssueMutationService } from './issue-mutation.service';
import type {
  IssueRepository,
  Issue,
} from '../infrastructure/issue.repository';
import type { EventWriter } from '../../eventing/application/event-writer.service';
import type { AuditWriter } from '../../audit/application/audit-writer.service';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('IssueMutationService', () => {
  const tx = {} as DatabaseTransaction;
  const issue = { id: 'i', revision: 4 } as Issue;
  const patch = jest.fn();
  const events = { append: jest.fn() },
    audit = { append: jest.fn() };
  const service = new IssueMutationService(
    { patch } as unknown as IssueRepository,
    events as unknown as EventWriter,
    audit as unknown as AuditWriter,
  );
  beforeEach(() => jest.clearAllMocks());
  it('publishes issue updates with the registered ordering-capable v2 contract', async () => {
    await service.fact(tx, 'w', 'm', 'i', 'issue.updated', {
      issue_id: 'i',
      changed_fields: ['sort_order'],
    });
    expect(events.append).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ schemaVersion: 2 }),
    );
  });
  it('rejects stale revisions before touching persistent state', async () => {
    await expect(
      service.bump(tx, issue, 3, { title: 'lost write' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(patch).not.toHaveBeenCalled();
  });
  it('increments one revision and overrides user-supplied revision', async () => {
    patch.mockResolvedValue({ ...issue, revision: 5 });
    await service.bump(tx, issue, 4, { title: 'safe', revision: 99 });
    expect(patch).toHaveBeenCalledWith(tx, 'i', { title: 'safe', revision: 5 });
  });
  it('never writes audit when event contract validation fails', async () => {
    events.append.mockRejectedValueOnce(new Error('invalid contract'));
    await expect(
      service.fact(tx, 'w', 'm', 'i', 'issue.updated', {}),
    ).rejects.toThrow('invalid contract');
    expect(audit.append).not.toHaveBeenCalled();
  });
  it('omits scheduler actors while preserving scope and attribution', async () => {
    await service.fact(tx, 'w', undefined, 'i', 'issue.cycle_changed', {
      issue_id: 'i',
    });
    expect(events.append).toHaveBeenCalledWith(tx, {
      workspaceId: 'w',
      aggregateType: 'issue',
      aggregateId: 'i',
      eventType: 'issue.cycle_changed',
      payload: { issue_id: 'i' },
    });
    expect(audit.append).toHaveBeenCalled();
  });
});

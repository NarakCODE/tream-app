import { ConflictException } from '@nestjs/common';
import { DocumentService } from './document.service';
import type { DocumentAccessService } from './document-access.service';
import type { DatabaseService } from '../../../database/database.service';
import type { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { EventWriter } from '../../eventing/application/event-writer.service';
import type { AuditWriter } from '../../audit/application/audit-writer.service';
import type { DatabaseTransaction } from '../../../database/transaction';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
const identity = { userId: 'user' } as IdempotencyReservationInput;
function fixture(deletedAt: Date | null = null) {
  const tx = { update: jest.fn() };
  const access = {
    require: jest.fn().mockResolvedValue({
      document: { id: 'doc', revision: 3, deletedAt, archivedAt: null },
      member: { id: 'member' },
    }),
  };
  const commands = {
    execute: async (
      _identity: unknown,
      handler: (tx: DatabaseTransaction) => Promise<unknown>,
      options: { authorize: (tx: DatabaseTransaction) => Promise<void> },
    ) => {
      await options.authorize(tx as unknown as DatabaseTransaction);
      return handler(tx as unknown as DatabaseTransaction);
    },
  };
  const service = new DocumentService(
    {} as DatabaseService,
    access as unknown as DocumentAccessService,
    commands as unknown as CommandBus,
    {} as EventWriter,
    {} as AuditWriter,
  );
  return { service, tx, access };
}
describe('Document mutation guarantees', () => {
  it('rejects stale revisions before changing stored content', async () => {
    const { service, tx, access } = fixture();
    await expect(
      service.update(identity, 'workspace', 'doc', {
        expectedRevision: 2,
        body: 'new',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.update).not.toHaveBeenCalled();
    expect(access.require).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      'workspace',
      'doc',
      'write',
      true,
      false,
    );
  });
  it('does not restore trash through archive', async () => {
    const { service, tx } = fixture(new Date());
    await expect(
      service.lifecycle(identity, 'workspace', 'doc', 3, 'archived'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.update).not.toHaveBeenCalled();
  });
});

import { NotFoundException } from '@nestjs/common';
import { InitiativeService } from './initiative.service';
import type { InitiativeAccessService } from './initiative-access.service';
import type { DatabaseService } from '../../../database/database.service';
import type { CommandBus } from '../../../common/idempotency/command-bus.service';
import type { EventWriter } from '../../eventing/application/event-writer.service';
import type { AuditWriter } from '../../audit/application/audit-writer.service';
import type { DatabaseTransaction } from '../../../database/transaction';
describe('Initiative aggregate progress privacy', () => {
  it('checks full ancestor access before loading any aggregate source data', async () => {
    const tx = { select: jest.fn() };
    const db = {
      db: {
        transaction: async (
          handler: (tx: DatabaseTransaction) => Promise<unknown>,
        ) => handler(tx as unknown as DatabaseTransaction),
      },
    };
    const access = {
      require: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Hidden initiative')),
    };
    const service = new InitiativeService(
      db as unknown as DatabaseService,
      access as unknown as InitiativeAccessService,
      {} as CommandBus,
      {} as EventWriter,
      {} as AuditWriter,
    );
    await expect(
      service.progress('user', 'workspace', 'initiative'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.select).not.toHaveBeenCalled();
  });
});

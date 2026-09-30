import {
  eventAggregateHeads,
  events,
} from '../../../database/schema/event.schema';
import { EventContractRegistry } from '../infrastructure/event-contract-registry';
import { EventConsumerRegistry } from './event-consumer-registry';
import { EventWriter } from './event-writer.service';
describe('EventWriter', () => {
  function setup() {
    const stored: Record<string, unknown>[] = [];
    let heads = 0;
    const tx = {
      insert: jest.fn((table: unknown) => ({
        values: (value: Record<string, unknown>) => {
          if (table === eventAggregateHeads) {
            heads++;
            return {
              onConflictDoUpdate: () => ({
                returning: () => Promise.resolve([{ revision: 7 }]),
              }),
            };
          }
          if (table === events) {
            stored.push(value);
            return { returning: () => Promise.resolve([value]) };
          }
          return Promise.resolve();
        },
      })),
    };
    return {
      tx,
      stored,
      heads: () => heads,
      writer: new EventWriter(
        new EventContractRegistry(),
        new EventConsumerRegistry(),
      ),
    };
  }
  const input = {
    workspaceId: 'ws1',
    aggregateType: 'workspace',
    aggregateId: 'ws1',
    eventType: 'workspace.created',
    payload: { workspace_id: 'ws1', owner_membership_id: 'mem1' },
  };
  it('shares a revision across distinct facts in the same transaction', async () => {
    const { writer, tx, stored, heads } = setup();
    await writer.append(tx as never, input);
    await writer.append(tx as never, {
      ...input,
      eventType: 'workspace.updated',
      payload: { workspace_id: 'ws1' },
    });
    expect(heads()).toBe(1);
    expect(stored.map((e) => e.aggregateVersion)).toEqual([7, 7]);
    expect(stored[0]?.id).not.toBe(stored[1]?.id);
  });
  it('rejects unregistered versions and unsafe payloads before reserving a revision', async () => {
    const { writer, tx } = setup();
    await expect(
      writer.append(tx as never, {
        ...input,
        payload: { ...input.payload, password: 'hidden' },
      }),
    ).rejects.toThrow('Invalid event payload');
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it('does not carry revision state across transactions', async () => {
    const first = setup();
    const second = setup();
    await first.writer.append(first.tx as never, input);
    await first.writer.append(second.tx as never, input);
    expect(first.heads()).toBe(1);
    expect(second.heads()).toBe(1);
  });
});

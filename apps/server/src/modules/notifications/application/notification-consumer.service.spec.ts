import {
  NotificationConsumer,
  NOTIFICATION_CONSUMER_KEY,
} from './notification-consumer.service';
import { EventConsumerRegistry } from '../../eventing/application/event-consumer-registry';
import type { NotificationAccessService } from './notification-access.service';
import type { NotificationRepository } from '../infrastructure/notification.repository';
import type { DatabaseTransaction } from '../../../database/transaction';
import type { events } from '../../../database/schema';
describe('notification fanout registration and privacy', () => {
  function fixture() {
    const registry = new EventConsumerRegistry();
    const access = { visibleRecipient: jest.fn() };
    const repository = { preference: jest.fn() };
    const consumer = new NotificationConsumer(
      registry,
      access as unknown as NotificationAccessService,
      repository as unknown as NotificationRepository,
    );
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      for: jest.fn().mockResolvedValue([]),
    };
    const insert = jest.fn();
    const tx = {
      select: jest.fn().mockReturnValue(query),
      insert,
    } as unknown as DatabaseTransaction;
    const event = {
      id: 'event',
      workspaceId: 'workspace',
      actorId: 'actor',
      eventType: 'issue.assigned',
      schemaVersion: 1,
      payload: { issue_id: 'issue', assignee_membership_id: 'recipient' },
    } as unknown as typeof events.$inferSelect;
    return { registry, access, repository, consumer, tx, insert, event };
  }
  it('registers a durable consumer key in the existing outbox registry', () => {
    const f = fixture();
    f.consumer.onModuleInit();
    expect(f.registry.keys()).toEqual([NOTIFICATION_CONSUMER_KEY]);
  });
  it('drops assignments to recipients whose current source permission is gone', async () => {
    const f = fixture();
    f.access.visibleRecipient.mockResolvedValue(null);
    await f.consumer.consume(f.tx, f.event);
    expect(f.access.visibleRecipient).toHaveBeenCalledWith(
      f.tx,
      'workspace',
      'recipient',
      { type: 'issue', id: 'issue' },
    );
    expect(f.insert).not.toHaveBeenCalled();
  });
  it('does not fan out actor self-assignment', async () => {
    const f = fixture();
    f.event.payload.assignee_membership_id = 'actor';
    await f.consumer.consume(f.tx, f.event);
    expect(f.access.visibleRecipient).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled();
  });
  it('disabled channel preferences suppress logical fanout', async () => {
    const f = fixture();
    f.access.visibleRecipient.mockResolvedValue({ user: { id: 'recipient' } });
    f.repository.preference.mockResolvedValue({
      inAppEnabled: false,
      emailEnabled: false,
    });
    await f.consumer.consume(f.tx, f.event);
    expect(f.insert).not.toHaveBeenCalled();
  });
  it('ignores unsupported fact versions instead of guessing contracts', async () => {
    const f = fixture();
    f.event.schemaVersion = 999;
    await f.consumer.consume(f.tx, f.event);
    expect(f.access.visibleRecipient).not.toHaveBeenCalled();
  });
});

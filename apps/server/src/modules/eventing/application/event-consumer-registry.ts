import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../database/transaction';
import type { events } from '../../../database/schema/event.schema';
export type EventConsumer = (
  tx: DatabaseTransaction,
  event: typeof events.$inferSelect,
) => Promise<void>;
@Injectable()
export class EventConsumerRegistry {
  private readonly consumers = new Map<string, EventConsumer>();
  register(key: string, handler: EventConsumer): void {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(key) || this.consumers.has(key))
      throw new Error('Invalid or duplicate consumer key');
    this.consumers.set(key, handler);
  }
  keys(): string[] {
    return [...this.consumers.keys()];
  }
  get(key: string): EventConsumer | undefined {
    return this.consumers.get(key);
  }
}

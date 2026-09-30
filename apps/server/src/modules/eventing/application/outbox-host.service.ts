import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { EventConsumerRegistry } from './event-consumer-registry';
import { OutboxWorker } from './outbox-worker.service';
@Injectable()
export class OutboxHost implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly workerId = randomUUID();
  private readonly logger = new Logger(OutboxHost.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | undefined;
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly worker: OutboxWorker,
    private readonly registry: EventConsumerRegistry,
  ) {}
  onApplicationBootstrap(): void {
    if (
      !this.config.getOrThrow('app.backgroundWorkersEnabled', { infer: true })
    )
      return;
    this.timer = setInterval(() => {
      void this.dispatchReady().catch(() =>
        this.logger.error('Outbox polling failed'),
      );
    }, 1000);
    this.timer.unref();
  }
  dispatchReady(limit = 20): Promise<number> {
    if (this.running) return this.running;
    const pending = this.drain(limit);
    this.running = pending;
    void pending
      .finally(() => {
        if (this.running === pending) this.running = undefined;
      })
      .catch(() => undefined);
    return pending;
  }
  private async drain(limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Invalid dispatch limit');
    await this.worker.quarantineExhausted();
    let processed = 0;
    for (const key of this.registry.keys()) {
      const consumer = this.registry.get(key);
      if (!consumer) continue;
      while (processed < limit) {
        const lease = await this.worker.claim(this.workerId, key);
        if (!lease) break;
        await this.worker.process(lease, consumer);
        processed++;
      }
    }
    return processed;
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}

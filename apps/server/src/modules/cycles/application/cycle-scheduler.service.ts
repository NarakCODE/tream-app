import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { CycleService } from './cycle.service';
@Injectable()
export class CycleScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CycleScheduler.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<number> | undefined;
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly service: CycleService,
  ) {}
  onApplicationBootstrap() {
    if (
      !this.config.getOrThrow('app.backgroundWorkersEnabled', { infer: true })
    )
      return;
    this.timer = setInterval(() => {
      void this.run().catch(() =>
        this.logger.error(
          'Cycle scheduler sweep failed; it will retry on the next sweep.',
        ),
      );
    }, 30_000);
    this.timer.unref();
  }
  run() {
    if (this.running) return this.running;
    const pending = this.service.runScheduled();
    this.running = pending;
    void pending
      .finally(() => {
        if (this.running === pending) this.running = undefined;
      })
      .catch(() => undefined);
    return pending;
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }
}

import type { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { CycleScheduler } from './cycle-scheduler.service';
import type { CycleService } from './cycle.service';
describe('cycle worker lifecycle', () => {
  afterEach(() => jest.useRealTimers());
  function scheduler(
    enabled: boolean,
    run = jest.fn<Promise<number>, []>().mockResolvedValue(1),
  ) {
    const config = { getOrThrow: () => enabled } as unknown as ConfigService<
      ApplicationConfiguration,
      true
    >;
    const service = { runScheduled: run } as unknown as CycleService;
    return { host: new CycleScheduler(config, service), run };
  }
  it('does not start timers when background workers are disabled', async () => {
    jest.useFakeTimers();
    const { host, run } = scheduler(false);
    host.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60000);
    expect(run).not.toHaveBeenCalled();
    await host.onModuleDestroy();
  });
  it('polls enabled workers and stops on shutdown', async () => {
    jest.useFakeTimers();
    const { host, run } = scheduler(true);
    host.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(30000);
    expect(run).toHaveBeenCalledTimes(1);
    await host.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('coalesces overlapping sweeps and releases the gate after failure', async () => {
    let reject!: (error: Error) => void;
    const run = jest
      .fn<Promise<number>, []>()
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(2);
    const { host } = scheduler(true, run);
    const first = host.run();
    const second = host.run();
    expect(second).toBe(first);
    reject(new Error('Transient database failure'));
    await expect(first).rejects.toThrow('Transient');
    await expect(host.run()).resolves.toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
    await host.onModuleDestroy();
  });
});

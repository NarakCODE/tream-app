import {
  recoveryDeadline,
  RetentionPolicyService,
} from './retention-policy.service';
import { RetentionWorker } from './retention-worker.service';
import type { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import type { FileCleanupWorker } from '../../files/application/file-cleanup.worker';
describe('retention boundaries', () => {
  it('uses elapsed calendar-independent duration for workspace trash', () => {
    expect(
      recoveryDeadline(new Date('2026-02-28T12:00:00Z')).toISOString(),
    ).toBe('2026-03-30T12:00:00.000Z');
  });
  it('reports actual supported policy and preserves immutable facts', () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue(30),
    } as unknown as ConfigService<ApplicationConfiguration, true>;
    const policy = new RetentionPolicyService(config).policy();
    expect(policy.workspace.recoverableTrashDays).toBe(30);
    expect(policy.preserved).toContain('identifier_aliases');
    expect(policy).not.toHaveProperty('workspaceErasure');
  });
  it('delegates storage purge to the existing durable worker', async () => {
    const files = { run: jest.fn().mockResolvedValue(2) };
    const worker = new RetentionWorker(files as unknown as FileCleanupWorker);
    await expect(worker.run()).resolves.toEqual({ filesPurged: 2 });
    expect(files.run).toHaveBeenCalledTimes(1);
  });
});

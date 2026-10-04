import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
const DAY_MS = 86400000;
export function recoveryDeadline(deletedAt: Date, days = 30): Date {
  return new Date(deletedAt.getTime() + days * DAY_MS);
}
@Injectable()
export class RetentionPolicyService {
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}
  policy() {
    return {
      workspace: { recoverableTrashDays: 30, restoreRequires: 'OWNER' },
      archive: { expires: false, preservesContent: true },
      files: {
        recoverableTrashDays: this.config.getOrThrow('files.retentionDays', {
          infer: true,
        }),
        automaticCleanup: true,
        quotaReleasedAfter: 'CONFIRMED_STORAGE_PURGE',
        restoreBefore: 'PURGE_CLAIM',
      },
      preserved: [
        'identifier_aliases',
        'author_membership_ids',
        'audit_facts',
        'business_events',
        'consumer_receipts',
        'resource_ids',
      ],
    };
  }
}

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { appConfig } from '../../config/app.config';
import { FilesystemObjectStorage } from '../../modules/files/infrastructure/storage/filesystem-object-storage';
import { S3ObjectStorage } from '../../modules/files/infrastructure/storage/s3-object-storage';
import { attachments, files, type fileStatus } from '../schema/files.schema';
import type { DemoContext } from './context';

const briefs = [
  [
    'portal-launch-brief',
    'Customer portal launch',
    'Ship accessible account management, secure billing access, and a clear support handoff. Maya owns pilot feedback; Oliver coordinates release readiness.',
  ],
  [
    'mobile-preview-checklist',
    'Mobile preview checklist',
    'Validate offline sync, push permission explanations, and sign-in on the device lab matrix before inviting pilot customers.',
  ],
  [
    'accessibility-audit',
    'Accessibility audit',
    'Review keyboard navigation, focus restoration, input labels, contrast, and reduced motion in the account and workspace journeys.',
  ],
  [
    'security-review',
    'Security review',
    'Confirm tenant boundaries, single-use verification tokens, session revocation, and attachment download authorization.',
  ],
  [
    'customer-migration-plan',
    'Customer migration plan',
    'Run a dry migration with a small pilot cohort. Record reconciliation results and keep rollback instructions available to support.',
  ],
  [
    'pilot-feedback-summary',
    'Pilot feedback summary',
    'Customers want clearer invitation status, faster issue search, and a more predictable mobile notification experience.',
  ],
  [
    'support-handoff',
    'Support handoff',
    'Publish known limitations, escalation contacts, and onboarding recovery instructions. Rehearse the first customer support call.',
  ],
  [
    'release-retrospective',
    'Release retrospective',
    'The previous milestone improved onboarding completion. Keep smaller releases and strengthen cross-team acceptance evidence.',
  ],
  [
    'device-lab-matrix',
    'Device lab matrix',
    'Cover iOS and Android on small and large displays. Test poor connectivity, expired sessions, and background resume.',
  ],
  [
    'partner-enablement',
    'Partner enablement',
    'Prepare a guided portal walkthrough, sample workspace, and mobile preview invitation for implementation partners.',
  ],
  [
    'launch-success-metrics',
    'Launch success metrics',
    'Track verified signup completion, workspace activation, first issue creation, and support response time across the pilot cohort.',
  ],
  [
    'rollout-decision-log',
    'Rollout decision log',
    'Use a phased launch. Expand access after the pilot acceptance review confirms stability, accessibility, and clear ownership.',
  ],
] as const;

/** Real immutable bytes back every READY fixture; unavailable lifecycle states stay unavailable. */
export async function seedFiles(ctx: DemoContext) {
  const config = appConfig().files;
  const storage =
    config.storageDriver === 's3'
      ? new S3ObjectStorage(config)
      : new FilesystemObjectStorage({
          rootDirectory: config.localRoot,
          maxFileBytes: config.maxFileBytes,
        });
  const statuses: (typeof fileStatus.enumValues)[number][] = [
    ...Array.from({ length: briefs.length }, () => 'READY' as const),
    'PENDING',
    'UPLOADED',
    'QUARANTINED',
    'DELETED',
    'PURGING',
    'PURGED',
    'EXPIRED',
  ];
  try {
    for (const [i, status] of statuses.entries()) {
      const brief = briefs[i % briefs.length]!;
      const bytes = Buffer.from(
        `NORTHSTAR\n${brief[1]}\n\n${brief[2]}\n\nOwner: Northstar launch team\nAcceptance: Link evidence to the corresponding issue and review it at the launch readiness meeting.\n`,
        'utf8',
      );
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const storageKey = ctx.id(`file-object:${i}`);
      const stored = [
        'READY',
        'UPLOADED',
        'QUARANTINED',
        'DELETED',
        'PURGING',
      ].includes(status);
      if (stored) await storage.put(storageKey, bytes);
      const deleted = ['DELETED', 'PURGING', 'PURGED'].includes(status);
      await ctx.tx.insert(files).values({
        id: ctx.id(`file:${i}`),
        workspaceId: ctx.workspaceId,
        createdById: ctx.member(i % 6),
        sourceAttachmentId: ctx.id(`attachment:${i}`),
        storageKey,
        name: `${brief[0]}${i >= briefs.length ? `-${status.toLowerCase()}` : ''}.txt`,
        declaredMimeType: 'text/plain',
        sizeBytes: bytes.length,
        sha256: checksum,
        actualSizeBytes: stored || deleted ? bytes.length : null,
        actualMimeType: stored || deleted ? 'text/plain' : null,
        actualSha256: stored || deleted ? checksum : null,
        status: 'PENDING',
        uploadExpiresAt: ctx.date(30),
        uploadedAt: stored || deleted ? ctx.date(-8) : null,
        readyAt: null,
        quarantinedAt: status === 'QUARANTINED' ? ctx.date(-6) : null,
        deletedAt: deleted ? ctx.date(-2) : null,
        purgeAfter: deleted ? ctx.date(30) : null,
        purgedAt: status === 'PURGED' ? ctx.date(-1) : null,
        createdAt: ctx.date(-10),
        updatedAt: ctx.date(-1),
      });
      const target =
        i % 4 === 0
          ? { issueId: ctx.issue(i % 72) }
          : i % 4 === 1
            ? { projectId: ctx.project(i % 10) }
            : i % 4 === 2
              ? { documentId: ctx.id(`document:${i % 12}`) }
              : { commentId: ctx.id('comment:0') };
      await ctx.tx.insert(attachments).values({
        id: ctx.id(`attachment:${i}`),
        workspaceId: ctx.workspaceId,
        fileId: ctx.id(`file:${i}`),
        ...target,
        createdById: ctx.member(i % 6),
        deletedAt: deleted ? ctx.date(-2) : null,
        createdAt: ctx.date(-10),
        updatedAt: ctx.date(-1),
      });
      const transitions: (typeof fileStatus.enumValues)[number][] =
        status === 'PENDING'
          ? []
          : status === 'EXPIRED'
            ? ['EXPIRED']
            : status === 'QUARANTINED'
              ? ['QUARANTINED']
              : status === 'UPLOADED'
                ? ['UPLOADED']
                : status === 'READY'
                  ? ['UPLOADED', 'READY']
                  : status === 'DELETED'
                    ? ['UPLOADED', 'READY', 'DELETED']
                    : status === 'PURGING'
                      ? ['UPLOADED', 'READY', 'DELETED', 'PURGING']
                      : ['UPLOADED', 'READY', 'DELETED', 'PURGING', 'PURGED'];
      for (const next of transitions) {
        await ctx.tx
          .update(files)
          .set({
            status: next,
            ...(next === 'READY'
              ? { readyAt: ctx.date(-7), deletedAt: null }
              : {}),
            ...(next === 'DELETED' ? { deletedAt: ctx.date(-2) } : {}),
          })
          .where(eq(files.id, ctx.id(`file:${i}`)));
      }
    }
  } finally {
    if (storage instanceof S3ObjectStorage) storage.onModuleDestroy();
  }
}

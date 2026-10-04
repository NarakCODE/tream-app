import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { createDemoContext } from './context';
import { DEMO_EMAIL, DEMO_PASSWORD } from './identity';
import type { DemoSeedResult } from './runner';

export interface DemoEndpointCheck {
  endpoint: string;
  status: number;
  records: number | null;
}

/** Exercise actual HTTP authorization, serialization, and lists as the demo owner. */
export async function verifyDemo(
  app: NestFastifyApplication,
  result: DemoSeedResult,
): Promise<DemoEndpointCheck[]> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    remoteAddress: '10.99.0.1',
  });
  if (login.statusCode !== 201)
    throw new Error(`Demo login failed: ${login.statusCode} ${login.body}`);
  const token = login.json<{ data: { accessToken: string } }>().data
    .accessToken;
  const headers = { authorization: `Bearer ${token}` };
  const base = `/workspaces/${result.workspaceId}`;
  // IDs are namespace-derived, never fixed global fixtures.
  const ctx = createDemoContext(
    undefined as never,
    result.namespace,
    result.workspaceId,
    new Date(),
  );
  const lists = [
    '/workspaces',
    `${base}/members`,
    `${base}/invitations`,
    `${base}/teams`,
    `${base}/project-statuses`,
    `${base}/projects`,
    `${base}/issues`,
    `${base}/labels`,
    `${base}/issue-templates`,
    `${base}/comments?targetType=issue&targetId=${result.issueId}`,
    `${base}/issues/${result.issueId}/comments`,
    `${base}/issues/${result.issueId}/labels`,
    `${base}/issues/${result.issueId}/subscribers`,
    `${base}/issues/${result.issueId}/activity`,
    `${base}/issues/${result.issueId}/relations`,
    `${base}/comments/${ctx.id('comment:0')}/reactions`,
    `${base}/projects/${result.projectId}/comments`,
    `${base}/projects/${result.projectId}/labels`,
    `${base}/projects/${result.projectId}/subscribers`,
    `${base}/notifications/${ctx.id('notification:1')}/deliveries`,
    `${base}/initiatives`,
    `${base}/initiatives/${result.initiativeId}/projects`,
    `${base}/initiatives/${result.initiativeId}/updates`,
    `${base}/initiatives/${result.initiativeId}/subscribers`,
    `${base}/documents`,
    `${base}/views`,
    `${base}/favorites`,
    `${base}/notifications`,
    `${base}/audit`,
    `${base}/outbox`,
    `${base}/trash`,
    `${base}/search?q=customer`,
    `${base}/file-attachments?targetType=issue&targetId=${result.issueId}`,
  ];
  for (let t = 0; t < 8; t++)
    lists.push(
      `${base}/teams/${ctx.team(t)}/members`,
      `${base}/teams/${ctx.team(t)}/statuses`,
      `${base}/teams/${ctx.team(t)}/issues`,
      `${base}/teams/${ctx.team(t)}/cycles`,
    );
  for (let p = 0; p < 12; p++)
    lists.push(
      `${base}/issues?projectId=${ctx.project(p)}`,
      `${base}/projects/${ctx.project(p)}/teams`,
      `${base}/projects/${ctx.project(p)}/members`,
      `${base}/projects/${ctx.project(p)}/milestones`,
      `${base}/projects/${ctx.project(p)}/updates`,
    );
  for (let v = 0; v < 11; v++)
    lists.push(`${base}/views/${ctx.id(`view:${v}`)}/results`);
  const details = [
    '/me',
    `${base}/preferences`,
    `${base}/retention-policy`,
    `${base}/notifications/unread-count`,
    `${base}/notifications/preferences`,
    `${base}/documents/${result.documentId}`,
    `${base}/projects/${result.projectId}/progress`,
    `${base}/initiatives/${result.initiativeId}/progress`,
    `${base}/files/${result.fileId}?attachmentId=${result.attachmentId}`,
    ...Array.from(
      { length: 8 },
      (_, t) => `${base}/teams/${ctx.team(t)}/cycles/${ctx.cycle(t, 1)}/report`,
    ),
  ];
  const checks: DemoEndpointCheck[] = [];
  const failures: string[] = [];
  for (const [paths, nonempty] of [
    [lists, true],
    [details, false],
  ] as const) {
    for (const endpoint of paths) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1${endpoint}`,
        headers,
      });
      let records: number | null = null;
      if (response.statusCode === 200) {
        const body = response.json<{ data?: unknown }>();
        const data = body.data;
        records = Array.isArray(data)
          ? data.length
          : data &&
              typeof data === 'object' &&
              'items' in data &&
              Array.isArray(data.items)
            ? data.items.length
            : null;
        if (nonempty && (records === null || records === 0))
          failures.push(`${endpoint}: empty or unexpected list envelope`);
        if (data === undefined || data === null)
          failures.push(`${endpoint}: missing data envelope`);
      } else
        failures.push(
          `${endpoint}: HTTP ${response.statusCode} ${response.body}`,
        );
      checks.push({ endpoint, status: response.statusCode, records });
    }
  }
  const grant = await app.inject({
    method: 'POST',
    url: `/api/v1${base}/files/${result.fileId}/download-grants`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { attachmentId: result.attachmentId },
  });
  if (grant.statusCode !== 201)
    failures.push(`Download grant: HTTP ${grant.statusCode} ${grant.body}`);
  else {
    const downloadUrl = grant.json<{ data: { downloadUrl: string } }>().data
      .downloadUrl;
    const content = await app.inject({
      method: 'GET',
      url: downloadUrl,
      headers,
    });
    checks.push({
      endpoint: 'seeded file download',
      status: content.statusCode,
      records: content.rawPayload.length,
    });
    if (content.statusCode !== 200 || content.rawPayload.length === 0)
      failures.push('Seeded file content did not download.');
  }
  if (failures.length)
    throw new Error(`Demo HTTP verification failed:\n${failures.join('\n')}`);
  return checks;
}

import { createApiClient } from '@repo/api-client';
import { describe, expect, it, vi } from 'vitest';
import { issuesApi } from './api';

function transport(data: unknown, meta: unknown = {}) {
   const fetchFn = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
         new Response(JSON.stringify({ data, meta }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
         })
      )
   );
   return { fetchFn, api: createApiClient({ baseUrl: 'http://localhost:3002', fetchFn }) };
}

describe('issues API transport contracts', () => {
   const sampleIssue = {
      id: 'ec0b6588-64ab-5a6d-aef5-ef9d50504115',
      workspaceId: 'ced841dd-2327-4c44-94e4-cfc8126285f2',
      teamId: '9a6ca9e0-0091-5f17-a5c9-94f65f04e27f',
      number: 9,
      identifier: 'DATA-9',
      revision: 1,
      archivedAt: null,
      parentId: null,
      createdById: '409e31af-e9c4-50d6-a484-801bfeda481f',
      title: 'Review customer feedback after launch — Billing Experience Refresh',
      description: 'Northstar deliverable...',
      statusId: '39653381-98c0-5351-a599-6fcd39eaa53a',
      priority: 'HIGH' as const,
      assigneeId: 'd7a028cb-7c6c-54dd-a9bf-539ff01de997',
      projectId: '1e321e6a-9aeb-5b86-a7c2-d4a84e93cba3',
      milestoneId: 'd2441d85-5ea9-5aa8-ab13-7deac25d430f',
      cycleId: 'c12cc187-5cb7-5502-a46e-756c415a2eca',
      dueDate: '2026-10-14T15:40:53.405Z',
      estimate: 5,
      sortOrder: 6800,
      createdAt: '2026-09-10T15:40:53.405Z',
      updatedAt: '2026-10-03T23:21:41.405Z',
      deletedAt: null,
   };

   const sampleMeta = {
      requestId: 'req_01M45ENYSQKQPP5Q5QZNAJ6RMC',
      timestamp: '2026-10-05T07:15:34.347Z',
      cursor: null,
      nextCursor: 'eyJ2IjoxLCJpZCI6IjEyMyJ9',
      hasNext: true,
      limit: 25,
      total: 70,
   };

   it('queries issues endpoint with defaults and does NOT include cursor when empty or whitespace', async () => {
      const { api, fetchFn } = transport([sampleIssue], sampleMeta);

      const result = await issuesApi.list(api, 'ced841dd-2327-4c44-94e4-cfc8126285f2', {
         cursor: '   ',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.identifier).toBe('DATA-9');
      expect(result.meta.hasNext).toBe(true);

      const url = new URL(String(fetchFn.mock.calls[0][0]));
      expect(url.pathname).toBe('/api/v1/workspaces/ced841dd-2327-4c44-94e4-cfc8126285f2/issues');
      expect(url.searchParams.get('limit')).toBe('25');
      expect(url.searchParams.has('lifecycle')).toBe(false);
      expect(url.searchParams.has('cursor')).toBe(false);
   });

   it('appends cursor only when cursor is nonempty', async () => {
      const { api, fetchFn } = transport([sampleIssue], sampleMeta);

      await issuesApi.list(api, 'ced841dd-2327-4c44-94e4-cfc8126285f2', {
         cursor: 'eyJ2IjoxLCJpZCI6IjEyMyJ9',
         limit: 10,
      });

      const url = new URL(String(fetchFn.mock.calls[0][0]));
      expect(url.searchParams.get('cursor')).toBe('eyJ2IjoxLCJpZCI6IjEyMyJ9');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.has('lifecycle')).toBe(false);
   });

   it('appends optional filters when supplied', async () => {
      const { api, fetchFn } = transport([sampleIssue], sampleMeta);

      await issuesApi.list(api, 'workspace-123', {
         lifecycle: 'archived',
         teamId: 'team-1',
         statusId: 'status-1',
         priority: 'HIGH',
         projectId: 'proj-1',
         cycleId: 'cycle-1',
         assigneeId: 'user-1',
         parentId: 'parent-1',
      });

      const url = new URL(String(fetchFn.mock.calls[0][0]));
      expect(url.pathname).toBe('/api/v1/workspaces/workspace-123/issues');
      expect(url.searchParams.get('lifecycle')).toBe('archived');
      expect(url.searchParams.get('teamId')).toBe('team-1');
      expect(url.searchParams.get('statusId')).toBe('status-1');
      expect(url.searchParams.get('priority')).toBe('HIGH');
      expect(url.searchParams.get('projectId')).toBe('proj-1');
      expect(url.searchParams.get('cycleId')).toBe('cycle-1');
      expect(url.searchParams.get('assigneeId')).toBe('user-1');
      expect(url.searchParams.get('parentId')).toBe('parent-1');
   });

   it('sends PATCH request when updating an issue', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      const result = await issuesApi.update(api, 'workspace-123', 'issue-1', {
         expectedRevision: 1,
         priority: 'URGENT',
      });

      expect(result.id).toBe(sampleIssue.id);
      const url = new URL(String(fetchFn.mock.calls[0][0]));
      expect(url.pathname).toBe('/api/v1/workspaces/workspace-123/issues/issue-1');
      const method = fetchFn.mock.calls[0][1]?.method;
      expect(method).toBe('PATCH');
   });

   it('sends POST /archive and POST /restore requests with expectedRevision', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      await issuesApi.archive(api, 'workspace-123', 'issue-1', 2);
      expect(new URL(String(fetchFn.mock.calls[0][0])).pathname).toBe(
         '/api/v1/workspaces/workspace-123/issues/issue-1/archive'
      );

      await issuesApi.restore(api, 'workspace-123', 'issue-1', 3);
      expect(new URL(String(fetchFn.mock.calls[1][0])).pathname).toBe(
         '/api/v1/workspaces/workspace-123/issues/issue-1/restore'
      );
   });

   it('sends DELETE request with expectedRevision body', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      await issuesApi.delete(api, 'workspace-123', 'issue-1', 1);
      const [callUrl, callOptions] = fetchFn.mock.calls[0] ?? [];
      expect(new URL(String(callUrl)).pathname).toBe(
         '/api/v1/workspaces/workspace-123/issues/issue-1'
      );
      expect(callOptions?.method).toBe('DELETE');
   });

   it('creates issue with POST request and sets valid UUID v4 Idempotency-Key header', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      const result = await issuesApi.create(api, 'workspace-123', {
         teamId: 'team-1',
         title: 'New Issue',
         priority: 'URGENT',
      });

      expect(result.id).toBe(sampleIssue.id);
      const [callUrl, callOptions] = fetchFn.mock.calls[0] ?? [];
      expect(new URL(String(callUrl)).pathname).toBe('/api/v1/workspaces/workspace-123/issues');
      expect(callOptions?.method).toBe('POST');
      const headers = new Headers(callOptions?.headers);
      const idempotencyKey = headers.get('Idempotency-Key');
      expect(idempotencyKey).toMatch(
         /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
   });

   it('accepts custom idempotency key when creating issue', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      await issuesApi.create(
         api,
         'workspace-123',
         {
            teamId: 'team-1',
            title: 'New Issue',
         },
         { idempotencyKey: 'a0000000-0000-4000-8000-000000000001' }
      );

      const [, callOptions] = fetchFn.mock.calls[0] ?? [];
      const headers = new Headers(callOptions?.headers);
      expect(headers.get('Idempotency-Key')).toBe('a0000000-0000-4000-8000-000000000001');
   });

   it('looks up issue by identifier', async () => {
      const { api, fetchFn } = transport({ ...sampleIssue, resolvedIdentifier: 'DATA-9' });

      const result = await issuesApi.lookup(api, 'workspace-123', 'DATA-9');
      expect(result.identifier).toBe('DATA-9');
      expect(new URL(String(fetchFn.mock.calls[0][0])).pathname).toBe(
         '/api/v1/workspaces/workspace-123/issues/identifier/DATA-9'
      );
   });

   it('transfers issue with POST /transfer', async () => {
      const { api, fetchFn } = transport(sampleIssue);

      await issuesApi.transfer(api, 'workspace-123', 'issue-1', {
         expectedRevision: 1,
         teamId: 'team-2',
      });

      const [callUrl, callOptions] = fetchFn.mock.calls[0] ?? [];
      expect(new URL(String(callUrl)).pathname).toBe(
         '/api/v1/workspaces/workspace-123/issues/issue-1/transfer'
      );
      expect(callOptions?.method).toBe('POST');
   });

   it('manages issue relations with GET, POST, and DELETE', async () => {
      const sampleRelation = {
         id: 'rel-1',
         workspaceId: 'workspace-123',
         sourceIssueId: 'issue-1',
         targetIssueId: 'issue-2',
         type: 'BLOCKS' as const,
      };

      const { api, fetchFn } = transport([sampleRelation]);
      const relations = await issuesApi.relations(api, 'workspace-123', 'issue-1');
      expect(relations).toHaveLength(1);
      expect(relations[0]?.type).toBe('BLOCKS');

      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(
               JSON.stringify({ data: { issue: sampleIssue, relation: sampleRelation } }),
               { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
         )
      );

      const added = await issuesApi.addRelation(api, 'workspace-123', 'issue-1', {
         expectedRevision: 1,
         targetIssueId: 'issue-2',
         type: 'BLOCKS',
      });
      expect(added.relation.id).toBe('rel-1');

      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(JSON.stringify({ data: { issue: sampleIssue, relationId: 'rel-1' } }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
            })
         )
      );

      const removed = await issuesApi.removeRelation(api, 'workspace-123', 'issue-1', 'rel-1', 2);
      expect(removed.relationId).toBe('rel-1');
   });

   it('rejects malformed response payloads', async () => {
      const { api } = transport([{ invalid: true }]);
      await expect(issuesApi.list(api, 'workspace-123')).rejects.toThrow();
   });
});

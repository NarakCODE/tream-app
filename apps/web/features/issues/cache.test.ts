import { QueryClient } from '@tanstack/react-query';
import type { IssueItem, IssueListResponse } from '@repo/schemas';
import { describe, expect, it } from 'vitest';
import {
   patchIssueInQueryCache,
   patchIssueRelationsInQueryCache,
   prependIssueToQueryCache,
   removeIssueFromQueryCache,
} from './cache';
import { issueKeys } from './queries';

const sampleIssue = (id: string, priority: 'HIGH' | 'URGENT' = 'HIGH'): IssueItem => ({
   id,
   workspaceId: 'w-1',
   teamId: 't-1',
   number: 1,
   identifier: 'DATA-1',
   revision: 1,
   archivedAt: null,
   parentId: null,
   createdById: 'u-1',
   title: 'Test issue',
   description: null,
   statusId: 's-1',
   priority,
   assigneeId: null,
   projectId: null,
   milestoneId: null,
   cycleId: null,
   dueDate: null,
   estimate: null,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
   deletedAt: null,
});

const listPages = (issues: IssueItem[][]) => ({
   pages: issues.map((data, index) => ({
      data,
      meta: {
         requestId: 'r-1',
         timestamp: '2026-01-01T00:00:00.000Z',
         cursor: index ? 'cur' : null,
         nextCursor: index ? null : 'cur',
         hasNext: !index,
         limit: 25,
         total: data.length,
      },
   })),
   pageParams: [undefined, 'cur'],
});

describe('issue cache across query pages', () => {
   it('patches an issue across infinite query pages and updates detail cache', () => {
      const client = new QueryClient();
      const listKey = issueKeys.list('w-1', { lifecycle: 'active', limit: 25 });
      client.setQueryData(listKey, listPages([[sampleIssue('issue-1', 'HIGH')]]));
      client.setQueryData(issueKeys.detail('w-1', 'issue-1'), sampleIssue('issue-1', 'HIGH'));

      const updated = {
         ...sampleIssue('issue-1', 'URGENT'),
         revision: 2,
      };

      patchIssueInQueryCache(client, 'w-1', updated);

      const cachedPages = client.getQueryData<{ pages: IssueListResponse[] }>(listKey);
      expect(cachedPages?.pages[0]?.data[0]?.priority).toBe('URGENT');
      expect(cachedPages?.pages[0]?.data[0]?.revision).toBe(2);

      const detail = client.getQueryData<IssueItem>(issueKeys.detail('w-1', 'issue-1'));
      expect(detail?.priority).toBe('URGENT');
   });

   it('prepends newly created issue to list cache and increments total', () => {
      const client = new QueryClient();
      const listKey = issueKeys.list('w-1', { lifecycle: 'active', limit: 25 });
      client.setQueryData(listKey, listPages([[sampleIssue('issue-1')]]));

      const newIssue = sampleIssue('issue-new');
      prependIssueToQueryCache(client, 'w-1', newIssue);

      const cachedPages = client.getQueryData<{ pages: IssueListResponse[] }>(listKey);
      expect(cachedPages?.pages[0]?.data).toHaveLength(2);
      expect(cachedPages?.pages[0]?.data[0]?.id).toBe('issue-new');
      expect(cachedPages?.pages[0]?.meta.total).toBe(2);

      const detail = client.getQueryData<IssueItem>(issueKeys.detail('w-1', 'issue-new'));
      expect(detail?.id).toBe('issue-new');
   });

   it('patches issue relations in query cache', () => {
      const client = new QueryClient();
      const relKey = issueKeys.relations('w-1', 'issue-1');
      client.setQueryData(relKey, []);

      patchIssueRelationsInQueryCache(client, 'w-1', 'issue-1', (current) => [
         ...current,
         {
            id: 'rel-1',
            workspaceId: 'w-1',
            sourceIssueId: 'issue-1',
            targetIssueId: 'issue-2',
            type: 'BLOCKS',
         },
      ]);

      const cached = client.getQueryData(relKey);
      expect(cached).toHaveLength(1);
   });
});

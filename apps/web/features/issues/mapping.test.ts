import { describe, expect, it } from 'vitest';
import type { IssueItem } from '@repo/schemas';
import type { TeamStatus } from '@/features/teams/types';
import {
   categoryToUiCategory,
   findTeamStatusIdForUiStatus,
   issueItemToUiIssue,
   resolveTeamStatusToUiStatus,
} from './mapping';

const mockTeamStatuses: TeamStatus[] = [
   {
      id: 'uuid-backlog',
      teamId: 'team-1',
      name: 'Backlog',
      category: 'BACKLOG',
      position: 0,
      isDefault: false,
   },
   {
      id: 'uuid-todo',
      teamId: 'team-1',
      name: 'Todo',
      category: 'UNSTARTED',
      position: 1,
      isDefault: true,
   },
   {
      id: 'uuid-progress',
      teamId: 'team-1',
      name: 'In Progress',
      category: 'STARTED',
      position: 2,
      isDefault: false,
   },
   {
      id: 'uuid-done',
      teamId: 'team-1',
      name: 'Done',
      category: 'COMPLETED',
      position: 3,
      isDefault: false,
   },
   {
      id: 'uuid-canceled',
      teamId: 'team-1',
      name: 'Canceled',
      category: 'CANCELED',
      position: 4,
      isDefault: false,
   },
];

const sampleItem: IssueItem = {
   id: 'issue-1',
   workspaceId: 'workspace-1',
   teamId: 'team-1',
   number: 1,
   identifier: 'CORE-1',
   revision: 1,
   createdById: 'user-1',
   title: 'Fix something',
   description: 'Details',
   statusId: 'uuid-progress',
   priority: 'HIGH',
   assigneeId: null,
   projectId: null,
   milestoneId: null,
   cycleId: null,
   dueDate: null,
   estimate: null,
   createdAt: '2026-10-06T00:00:00.000Z',
   updatedAt: '2026-10-06T00:00:00.000Z',
};

describe('features/issues/mapping', () => {
   describe('categoryToUiCategory', () => {
      it('converts backend categories to UI categories', () => {
         expect(categoryToUiCategory('BACKLOG')).toBe('backlog');
         expect(categoryToUiCategory('UNSTARTED')).toBe('unstarted');
         expect(categoryToUiCategory('STARTED')).toBe('started');
         expect(categoryToUiCategory('COMPLETED')).toBe('completed');
         expect(categoryToUiCategory('CANCELED')).toBe('canceled');
         expect(categoryToUiCategory('DUPLICATE')).toBe('canceled');
         expect(categoryToUiCategory('UNKNOWN')).toBe('unstarted');
      });
   });

   describe('resolveTeamStatusToUiStatus', () => {
      it('resolves by name matching', () => {
         const result = resolveTeamStatusToUiStatus(mockTeamStatuses[2]!);
         expect(result.id).toBe('in-progress');
         expect(result.name).toBe('In Progress');
      });

      it('resolves by category when name is custom', () => {
         const customStatus: TeamStatus = {
            id: 'uuid-dev',
            teamId: 'team-1',
            name: 'Active Development',
            category: 'STARTED',
            position: 2,
            isDefault: false,
         };
         const result = resolveTeamStatusToUiStatus(customStatus);
         expect(result.category).toBe('started');
      });

      it('falls back to to-do when teamStatus is missing and raw status is unknown UUID', () => {
         const result = resolveTeamStatusToUiStatus(null, 'unknown-uuid');
         expect(result.id).toBe('to-do');
      });

      it('resolves direct slug ID when rawStatusId matches standard slug', () => {
         const result = resolveTeamStatusToUiStatus(null, 'done');
         expect(result.id).toBe('done');
      });
   });

   describe('findTeamStatusIdForUiStatus', () => {
      it('returns matching team status UUID by UI slug', () => {
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'in-progress')).toBe('uuid-progress');
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'done')).toBe('uuid-done');
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'to-do')).toBe('uuid-todo');
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'backlog')).toBe('uuid-backlog');
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'canceled')).toBe('uuid-canceled');
      });

      it('returns existing UUID if the input is already a UUID in the catalog', () => {
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, 'uuid-done')).toBe('uuid-done');
      });

      it('returns matching UUID when passed a Status object', () => {
         const statusObj = { id: 'done', name: 'Done', color: '#5e6ad2', category: 'completed' as const, icon: () => null };
         expect(findTeamStatusIdForUiStatus(mockTeamStatuses, statusObj)).toBe('uuid-done');
      });

      it('returns undefined if no matching status exists', () => {
         expect(findTeamStatusIdForUiStatus([], 'done')).toBeUndefined();
      });
   });

   describe('issueItemToUiIssue', () => {
      it('maps issue to the correct UI status when teamStatuses array is provided', () => {
         const uiIssue = issueItemToUiIssue(sampleItem, mockTeamStatuses);
         expect(uiIssue.status.id).toBe('in-progress');
         expect(uiIssue.teamId).toBe('team-1');
         expect(uiIssue.statusId).toBe('uuid-progress');
         expect(uiIssue.priority.id).toBe('high');
      });

      it('maps issue to the correct UI status when teamStatuses Map is provided', () => {
         const map = new Map<string, TeamStatus>();
         mockTeamStatuses.forEach((s) => map.set(s.id, s));

         const uiIssue = issueItemToUiIssue({ ...sampleItem, statusId: 'uuid-done' }, map);
         expect(uiIssue.status.id).toBe('done');
         expect(uiIssue.status.name).toBe('Done');
      });

      it('falls back to to-do when teamStatuses is not provided and statusId is a UUID', () => {
         const uiIssue = issueItemToUiIssue(sampleItem);
         expect(uiIssue.status.id).toBe('to-do');
      });
   });
});

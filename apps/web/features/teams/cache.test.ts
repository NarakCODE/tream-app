import { QueryClient } from '@tanstack/react-query';
import type { Team, TeamMember, TeamSettings, TeamStatus } from '@repo/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
   invalidateTeamLists,
   patchTeamInQueryCache,
   patchTeamMembersInQueryCache,
   patchTeamSettingsInQueryCache,
   patchTeamStatusesInQueryCache,
   prependTeamToQueryCache,
   removeTeamFromQueryCache,
} from './cache';
import { teamKeys } from './queries';

const sampleTeam = (id: string, name = 'Team 1'): Team => ({
   id,
   workspaceId: 'ws-1',
   name,
   key: 'T1',
   description: null,
   visibility: 'WORKSPACE',
   icon: null,
   color: null,
   nextIssueNumber: 1,
   timezone: 'UTC',
   cyclesEnabled: false,
   cycleDurationWeeks: 2,
   cycleStartDay: 1,
   cycleCooldownDays: 0,
   upcomingCyclesCount: 3,
   retiredAt: null,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
});

const listPages = (teams: Team[][]) => ({
   pages: teams.map((data, index) => ({
      data,
      meta: {
         cursor: index ? 'cur' : null,
         nextCursor: index ? null : 'cur',
         hasNext: !index,
         limit: 50,
         total: data.length,
      },
   })),
   pageParams: [undefined, 'cur'],
});

describe('team query cache mutators', () => {
   const workspaceId = 'ws-1';
   const teamId = 'team-1';

   it('prepends newly created team to empty list cache and initializes detail cache', () => {
      const client = new QueryClient();
      const newTeam = sampleTeam('team-new', 'Brand New Team');

      prependTeamToQueryCache(client, workspaceId, newTeam);

      const list = client.getQueryData<{ pages: Array<{ data: Team[]; meta: { total: number } }> }>(
         teamKeys.list(workspaceId)
      );
      expect(list?.pages[0]?.data).toHaveLength(1);
      expect(list?.pages[0]?.data[0]?.name).toBe('Brand New Team');
      expect(list?.pages[0]?.meta.total).toBe(1);

      const detail = client.getQueryData<Team>(teamKeys.detail(workspaceId, 'team-new'));
      expect(detail?.name).toBe('Brand New Team');
   });

   it('prepends newly created team to existing list pages and increments total', () => {
      const client = new QueryClient();
      client.setQueryData(teamKeys.list(workspaceId), listPages([[sampleTeam('team-1')]]));

      const newTeam = sampleTeam('team-2', 'Second Team');
      prependTeamToQueryCache(client, workspaceId, newTeam);

      const list = client.getQueryData<{ pages: Array<{ data: Team[]; meta: { total: number } }> }>(
         teamKeys.list(workspaceId)
      );
      expect(list?.pages[0]?.data).toHaveLength(2);
      expect(list?.pages[0]?.data[0]?.id).toBe('team-2');
      expect(list?.pages[0]?.meta.total).toBe(2);
   });

   it('patches team in both list pages and detail cache', () => {
      const client = new QueryClient();
      client.setQueryData(teamKeys.list(workspaceId), listPages([[sampleTeam('team-1')]]));
      client.setQueryData(teamKeys.detail(workspaceId, 'team-1'), sampleTeam('team-1'));

      patchTeamInQueryCache(client, workspaceId, {
         ...sampleTeam('team-1'),
         name: 'Updated Name',
      });

      const detail = client.getQueryData<Team>(teamKeys.detail(workspaceId, 'team-1'));
      expect(detail?.name).toBe('Updated Name');

      const list = client.getQueryData<{ pages: Array<{ data: Team[] }> }>(
         teamKeys.list(workspaceId)
      );
      expect(list?.pages[0]?.data[0]?.name).toBe('Updated Name');
   });

   it('removes team from list cache and deletes detail query', () => {
      const client = new QueryClient();
      client.setQueryData(
         teamKeys.list(workspaceId),
         listPages([[sampleTeam('team-1'), sampleTeam('team-2')]])
      );
      client.setQueryData(teamKeys.detail(workspaceId, 'team-1'), sampleTeam('team-1'));

      removeTeamFromQueryCache(client, workspaceId, 'team-1');

      const detail = client.getQueryData<Team>(teamKeys.detail(workspaceId, 'team-1'));
      expect(detail).toBeUndefined();

      const list = client.getQueryData<{ pages: Array<{ data: Team[]; meta: { total: number } }> }>(
         teamKeys.list(workspaceId)
      );
      expect(list?.pages[0]?.data).toHaveLength(1);
      expect(list?.pages[0]?.data[0]?.id).toBe('team-2');
      expect(list?.pages[0]?.meta.total).toBe(1);
   });

   it('patches team members in query cache', () => {
      const client = new QueryClient();
      const initial: TeamMember[] = [{ id: 'm-1', membershipId: 'mem-1', role: 'MEMBER' }];
      client.setQueryData(teamKeys.members(workspaceId, teamId), initial);

      patchTeamMembersInQueryCache(client, workspaceId, teamId, (cur) => [
         ...cur,
         { id: 'm-2', membershipId: 'mem-2', role: 'ADMIN' },
      ]);

      const members = client.getQueryData<TeamMember[]>(teamKeys.members(workspaceId, teamId));
      expect(members).toHaveLength(2);
      expect(members?.[1]?.role).toBe('ADMIN');
   });

   it('patches team settings in both settings and detail cache', () => {
      const client = new QueryClient();
      client.setQueryData(teamKeys.detail(workspaceId, teamId), sampleTeam(teamId));

      const newSettings: TeamSettings = {
         timezone: 'Europe/London',
         cyclesEnabled: true,
         cycleDurationWeeks: 3,
         cycleStartDay: 1,
         cycleCooldownDays: 2,
         upcomingCyclesCount: 5,
      };

      patchTeamSettingsInQueryCache(client, workspaceId, teamId, newSettings);

      const settings = client.getQueryData<TeamSettings>(teamKeys.settings(workspaceId, teamId));
      expect(settings?.timezone).toBe('Europe/London');

      const detail = client.getQueryData<Team>(teamKeys.detail(workspaceId, teamId));
      expect(detail?.timezone).toBe('Europe/London');
      expect(detail?.cycleDurationWeeks).toBe(3);
   });

   it('patches team statuses in query cache', () => {
      const client = new QueryClient();
      const initial: TeamStatus[] = [
         { id: 's-1', teamId, name: 'Todo', category: 'UNSTARTED', position: 0, isDefault: true },
      ];
      client.setQueryData(teamKeys.statuses(workspaceId, teamId), initial);

      patchTeamStatusesInQueryCache(client, workspaceId, teamId, (cur) => [
         ...cur,
         { id: 's-2', teamId, name: 'Done', category: 'COMPLETED', position: 1, isDefault: false },
      ]);

      const statuses = client.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(statuses).toHaveLength(2);
      expect(statuses?.[1]?.category).toBe('COMPLETED');
   });

   it('invalidates team lists query key', () => {
      const client = new QueryClient();
      const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

      invalidateTeamLists(client, workspaceId);

      expect(invalidateSpy).toHaveBeenCalledWith({
         queryKey: teamKeys.list(workspaceId),
      });
   });
});

import { createApiClient } from '@repo/api-client';
import { describe, expect, it, vi } from 'vitest';
import { teamsApi } from './api';

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

describe('teams API transport contracts', () => {
   const workspaceId = 'ws-test-1';
   const teamId = 'team-test-1';

   const sampleTeam = {
      id: teamId,
      workspaceId,
      name: 'Platform Engineering',
      key: 'PLAT',
      description: 'Core infrastructure team',
      visibility: 'WORKSPACE' as const,
      icon: null,
      color: null,
      nextIssueNumber: 1,
      timezone: 'UTC',
      cyclesEnabled: true,
      cycleDurationWeeks: 2,
      cycleStartDay: 1,
      cycleCooldownDays: 0,
      upcomingCyclesCount: 3,
      retiredAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
   };

   const sampleMeta = {
      requestId: 'req_01',
      timestamp: '2026-01-01T00:00:00.000Z',
      cursor: null,
      nextCursor: 'cur_next',
      hasNext: true,
      limit: 50,
      total: 10,
   };

   it('lists teams with cursor pagination', async () => {
      const { api, fetchFn } = transport([sampleTeam], sampleMeta);
      const res = await teamsApi.list(api, workspaceId, 'cur_prev');

      expect(fetchFn).toHaveBeenCalledWith(
         expect.stringContaining(
            `/api/v1/workspaces/${workspaceId}/teams?limit=50&cursor=cur_prev`
         ),
         expect.anything()
      );
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(10);
   });

   it('creates a new team with idempotency key', async () => {
      const { api, fetchFn } = transport(sampleTeam);
      const result = await teamsApi.create(
         api,
         workspaceId,
         { name: 'Platform Engineering', key: 'PLAT', visibility: 'WORKSPACE' },
         'custom-key-123'
      );

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams`,
         expect.objectContaining({
            method: 'POST',
         })
      );
      const [, callOptions] = fetchFn.mock.calls[0] ?? [];
      const headers = new Headers(callOptions?.headers);
      expect(headers.get('Idempotency-Key')).toBe('custom-key-123');
      expect(result.id).toBe(teamId);
      expect(result.key).toBe('PLAT');
   });

   it('gets team details by ID', async () => {
      const { api, fetchFn } = transport(sampleTeam);
      const result = await teamsApi.get(api, workspaceId, teamId);

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.objectContaining({ method: 'GET' })
      );
      expect(result.name).toBe('Platform Engineering');
   });

   it('updates team profile', async () => {
      const { api, fetchFn } = transport({ ...sampleTeam, name: 'Core Platform' });
      const result = await teamsApi.update(api, workspaceId, teamId, { name: 'Core Platform' });

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ name: 'Core Platform' }),
         })
      );
      expect(result.name).toBe('Core Platform');
   });

   it('retires a team', async () => {
      const { api, fetchFn } = transport({ id: teamId, retiredAt: '2026-01-01' });
      const result = await teamsApi.retire(api, workspaceId, teamId);

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.id).toBe(teamId);
   });

   it('fetches team members', async () => {
      const member = {
         id: 'tm-1',
         membershipId: 'mem-1',
         role: 'ADMIN' as const,
         createdAt: '2026-01-01T00:00:00.000Z',
      };
      const { api, fetchFn } = transport([member]);
      const result = await teamsApi.members(api, workspaceId, teamId);

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/members`,
         expect.objectContaining({ method: 'GET' })
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe('ADMIN');
   });

   it('adds a team member', async () => {
      const member = {
         id: 'tm-2',
         membershipId: 'mem-2',
         role: 'MEMBER' as const,
      };
      const { api, fetchFn } = transport(member);
      const result = await teamsApi.addMember(api, workspaceId, teamId, {
         membershipId: 'mem-2',
         role: 'MEMBER',
      });

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/members`,
         expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ membershipId: 'mem-2', role: 'MEMBER' }),
         })
      );
      expect(result.membershipId).toBe('mem-2');
   });

   it('updates team member role', async () => {
      const member = {
         id: 'tm-2',
         membershipId: 'mem-2',
         role: 'ADMIN' as const,
      };
      const { api, fetchFn } = transport(member);
      const result = await teamsApi.updateMember(api, workspaceId, teamId, 'mem-2', {
         role: 'ADMIN',
      });

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/members/mem-2`,
         expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ role: 'ADMIN' }),
         })
      );
      expect(result.role).toBe('ADMIN');
   });

   it('removes a team member', async () => {
      const { api, fetchFn } = transport({ membershipId: 'mem-2', removed: true });
      const result = await teamsApi.removeMember(api, workspaceId, teamId, 'mem-2');

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/members/mem-2`,
         expect.objectContaining({ method: 'DELETE' })
      );
      expect(result.removed).toBe(true);
   });

   it('fetches team settings', async () => {
      const settings = {
         timezone: 'America/New_York',
         cyclesEnabled: true,
         cycleDurationWeeks: 2,
         cycleStartDay: 1,
         cycleCooldownDays: 0,
         upcomingCyclesCount: 3,
      };
      const { api, fetchFn } = transport(settings);
      const result = await teamsApi.settings(api, workspaceId, teamId);

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/settings`,
         expect.objectContaining({ method: 'GET' })
      );
      expect(result.timezone).toBe('America/New_York');
   });

   it('updates team settings', async () => {
      const updatedTeam = {
         id: teamId,
         workspaceId,
         name: 'Platform',
         key: 'PLAT',
         visibility: 'WORKSPACE' as const,
         timezone: 'UTC',
         cyclesEnabled: false,
         cycleDurationWeeks: 3,
         cycleStartDay: 2,
         cycleCooldownDays: 1,
         upcomingCyclesCount: 4,
      };
      const { api, fetchFn } = transport(updatedTeam);
      const result = await teamsApi.updateSettings(api, workspaceId, teamId, {
         cycleDurationWeeks: 3,
      });

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/settings`,
         expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ cycleDurationWeeks: 3 }),
         })
      );
      expect(result.cycleDurationWeeks).toBe(3);
   });

   it('fetches and mutates workflow statuses', async () => {
      const statuses = [
         {
            id: 'stat-1',
            teamId,
            name: 'Backlog',
            category: 'BACKLOG' as const,
            position: 0,
            isDefault: false,
         },
      ];
      const { api, fetchFn } = transport(statuses);
      const list = await teamsApi.statuses(api, workspaceId, teamId);
      expect(list).toHaveLength(1);

      // Create status
      const newStatus = {
         id: 'stat-2',
         teamId,
         name: 'Todo',
         category: 'UNSTARTED' as const,
         position: 1,
         isDefault: true,
      };
      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(JSON.stringify({ data: newStatus }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
            })
         )
      );
      const created = await teamsApi.createStatus(api, workspaceId, teamId, {
         name: 'Todo',
         category: 'UNSTARTED',
      });
      expect(created.id).toBe('stat-2');

      // Reorder statuses
      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(JSON.stringify({ data: [newStatus, statuses[0]] }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
            })
         )
      );
      const reordered = await teamsApi.reorderStatuses(api, workspaceId, teamId, {
         statusIds: ['stat-2', 'stat-1'],
      });
      expect(reordered[0]?.id).toBe('stat-2');

      // Set default
      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(JSON.stringify({ data: { ...newStatus, isDefault: true } }), {
               status: 200,
               headers: { 'Content-Type': 'application/json' },
            })
         )
      );
      const def = await teamsApi.setDefaultStatus(api, workspaceId, teamId, 'stat-2');
      expect(def.isDefault).toBe(true);

      // Retire status
      fetchFn.mockImplementationOnce(() =>
         Promise.resolve(
            new Response(
               JSON.stringify({
                  data: { id: 'stat-1', isDefault: false, retiredAt: '2026-01-01' },
               }),
               {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
               }
            )
         )
      );
      const retired = await teamsApi.retireStatus(api, workspaceId, teamId, 'stat-1', {
         replacementStatusId: 'stat-2',
      });
      expect(retired.id).toBe('stat-1');
   });

   it('queries team issues', async () => {
      const issue = {
         id: 'iss-1',
         workspaceId,
         teamId,
         createdById: 'usr-1',
         number: 1,
         identifier: 'PLAT-1',
         revision: 1,
         title: 'First issue',
         statusId: 'stat-1',
         priority: 'LOW' as const,
         createdAt: '2026-01-01',
         updatedAt: '2026-01-01',
      };
      const { api, fetchFn } = transport([issue], sampleMeta);
      const res = await teamsApi.issues(api, workspaceId, teamId);

      expect(fetchFn).toHaveBeenCalledWith(
         `http://localhost:3002/api/v1/workspaces/${workspaceId}/teams/${teamId}/issues?limit=50`,
         expect.anything()
      );
      expect(res.data).toHaveLength(1);
   });
});

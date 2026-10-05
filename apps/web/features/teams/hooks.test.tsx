import React, { type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Team, TeamMember, TeamSettings, TeamStatus } from '@repo/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { teamKeys } from './queries';
import {
   useAddTeamMember,
   useCreateTeam,
   useCreateTeamStatus,
   useRemoveTeamMember,
   useReorderTeamStatuses,
   useRetireTeam,
   useRetireTeamStatus,
   useSetDefaultTeamStatus,
   useTeamDetail,
   useTeamIssues,
   useTeamList,
   useTeamMembers,
   useTeamSettings,
   useTeamStatuses,
   useUpdateTeam,
   useUpdateTeamMember,
   useUpdateTeamSettings,
   useUpdateTeamStatus,
} from './hooks';

const mocks = vi.hoisted(() => ({
   get: vi.fn(),
   post: vi.fn(),
   patch: vi.fn(),
   delete: vi.fn(),
   toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
   api: {
      get: mocks.get,
      post: mocks.post,
      patch: mocks.patch,
      delete: mocks.delete,
   },
}));

vi.mock('sonner', () => ({
   toast: mocks.toast,
}));

const workspaceId = 'ws-test-1';
const teamId = 'team-test-1';

const sampleTeam: Team = {
   id: teamId,
   workspaceId,
   name: 'Platform Engineering',
   key: 'PLAT',
   description: 'Core infrastructure',
   visibility: 'WORKSPACE',
   nextIssueNumber: 5,
   timezone: 'UTC',
   cyclesEnabled: true,
   cycleDurationWeeks: 2,
   cycleStartDay: 1,
   cycleCooldownDays: 0,
   upcomingCyclesCount: 3,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleMember: TeamMember = {
   id: 'tm-1',
   membershipId: 'mem-1',
   role: 'ADMIN',
   createdAt: '2026-01-01T00:00:00.000Z',
};

const sampleSettings: TeamSettings = {
   timezone: 'UTC',
   cyclesEnabled: true,
   cycleDurationWeeks: 2,
   cycleStartDay: 1,
   cycleCooldownDays: 0,
   upcomingCyclesCount: 3,
};

const sampleStatuses: TeamStatus[] = [
   {
      id: 'stat-1',
      teamId,
      name: 'Backlog',
      category: 'BACKLOG',
      position: 0,
      isDefault: false,
   },
   {
      id: 'stat-2',
      teamId,
      name: 'Todo',
      category: 'UNSTARTED',
      position: 1,
      isDefault: true,
   },
];

function createWrapper() {
   const queryClient = new QueryClient({
      defaultOptions: {
         queries: { retry: false },
         mutations: { retry: false },
      },
   });
   const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
   );
   return { queryClient, wrapper };
}

beforeEach(() => {
   vi.clearAllMocks();
});

afterEach(() => {
   cleanup();
});

describe('useTeamList & useTeamDetail queries', () => {
   it('fetches team list with cursor pagination', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({
         data: [sampleTeam],
         meta: { total: 1, hasNext: false, limit: 50, nextCursor: null },
      });

      const { result } = renderHook(() => useTeamList(workspaceId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages[0]?.data).toEqual([sampleTeam]);
      expect(mocks.get).toHaveBeenCalledWith(
         expect.stringContaining(`/api/v1/workspaces/${workspaceId}/teams`),
         expect.anything(),
         expect.objectContaining({ params: { limit: 50, cursor: undefined } })
      );
   });

   it('fetches single team details by ID', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({ data: sampleTeam });

      const { result } = renderHook(() => useTeamDetail(workspaceId, teamId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleTeam);
      expect(mocks.get).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.anything(),
         expect.anything()
      );
   });
});

describe('team mutation hooks', () => {
   it('creates a team, caches it, and triggers success toast', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.list(workspaceId), {
         pages: [
            {
               data: [sampleTeam],
               meta: { total: 1, hasNext: false, limit: 50, nextCursor: null },
            },
         ],
         pageParams: [undefined],
      });

      const newTeam: Team = {
         ...sampleTeam,
         id: 'team-new',
         key: 'CORE',
         name: 'Core Team',
      };
      mocks.post.mockResolvedValueOnce({ data: newTeam });

      const { result } = renderHook(() => useCreateTeam(workspaceId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({
            input: { name: 'Core Team', key: 'CORE', visibility: 'WORKSPACE' },
         });
      });

      expect(mocks.post).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams`,
         expect.anything(),
         expect.objectContaining({ name: 'Core Team', key: 'CORE' }),
         expect.objectContaining({
            headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
         })
      );
      expect(mocks.toast.success).toHaveBeenCalledWith('Created team CORE');

      const cached = queryClient.getQueryData<{ pages: Array<{ data: Team[] }> }>(
         teamKeys.list(workspaceId)
      );
      expect(cached?.pages[0]?.data.some((t) => t.id === 'team-new')).toBe(true);
   });

   it('updates team details and patches query cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.detail(workspaceId, teamId), sampleTeam);

      const updatedTeam: Team = { ...sampleTeam, name: 'Platform V2' };
      mocks.patch.mockResolvedValueOnce({ data: updatedTeam });

      const { result } = renderHook(() => useUpdateTeam(workspaceId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({
            teamId,
            input: { name: 'Platform V2' },
         });
      });

      expect(mocks.patch).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.anything(),
         { name: 'Platform V2' },
         expect.anything()
      );

      const cached = queryClient.getQueryData<Team>(teamKeys.detail(workspaceId, teamId));
      expect(cached?.name).toBe('Platform V2');
   });

   it('retires a team and removes it from list and detail cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.detail(workspaceId, teamId), sampleTeam);
      queryClient.setQueryData(teamKeys.list(workspaceId), {
         pages: [
            {
               data: [sampleTeam],
               meta: { total: 1, hasNext: false, limit: 50, nextCursor: null },
            },
         ],
         pageParams: [undefined],
      });

      mocks.delete.mockResolvedValueOnce({ data: { id: teamId, retiredAt: '2026-01-01' } });

      const { result } = renderHook(() => useRetireTeam(workspaceId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ teamId });
      });

      expect(mocks.delete).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}`,
         expect.anything(),
         expect.anything()
      );

      const cachedDetail = queryClient.getQueryData<Team>(teamKeys.detail(workspaceId, teamId));
      expect(cachedDetail).toBeUndefined();

      const cachedList = queryClient.getQueryData<{ pages: Array<{ data: Team[] }> }>(
         teamKeys.list(workspaceId)
      );
      expect(cachedList?.pages[0]?.data.find((t) => t.id === teamId)).toBeUndefined();
   });
});

describe('team membership hooks', () => {
   it('fetches team members', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({ data: [sampleMember] });

      const { result } = renderHook(() => useTeamMembers(workspaceId, teamId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([sampleMember]);
      expect(mocks.get).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}/members`,
         expect.anything(),
         expect.anything()
      );
   });

   it('adds a team member and updates member cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.members(workspaceId, teamId), [sampleMember]);

      const newMember: TeamMember = {
         id: 'tm-2',
         membershipId: 'mem-2',
         role: 'MEMBER',
         createdAt: '2026-01-01T00:00:00.000Z',
      };
      mocks.post.mockResolvedValueOnce({ data: newMember });

      const { result } = renderHook(() => useAddTeamMember(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ membershipId: 'mem-2', role: 'MEMBER' });
      });

      const cached = queryClient.getQueryData<TeamMember[]>(teamKeys.members(workspaceId, teamId));
      expect(cached).toHaveLength(2);
      expect(cached?.[1]?.membershipId).toBe('mem-2');
   });

   it('updates team member role and patches cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.members(workspaceId, teamId), [sampleMember]);

      const updatedMember: TeamMember = { ...sampleMember, role: 'MEMBER' };
      mocks.patch.mockResolvedValueOnce({ data: updatedMember });

      const { result } = renderHook(() => useUpdateTeamMember(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ membershipId: 'mem-1', role: 'MEMBER' });
      });

      const cached = queryClient.getQueryData<TeamMember[]>(teamKeys.members(workspaceId, teamId));
      expect(cached?.[0]?.role).toBe('MEMBER');
   });

   it('removes team member and filters out from cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.members(workspaceId, teamId), [sampleMember]);

      mocks.delete.mockResolvedValueOnce({ data: { membershipId: 'mem-1', removed: true } });

      const { result } = renderHook(() => useRemoveTeamMember(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ membershipId: 'mem-1' });
      });

      const cached = queryClient.getQueryData<TeamMember[]>(teamKeys.members(workspaceId, teamId));
      expect(cached).toHaveLength(0);
   });
});

describe('team settings hooks', () => {
   it('fetches team settings', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({ data: sampleSettings });

      const { result } = renderHook(() => useTeamSettings(workspaceId, teamId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleSettings);
      expect(mocks.get).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}/settings`,
         expect.anything(),
         expect.anything()
      );
   });

   it('updates team settings and updates cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.settings(workspaceId, teamId), sampleSettings);

      const updatedSettings: TeamSettings = { ...sampleSettings, cycleDurationWeeks: 3 };
      mocks.patch.mockResolvedValueOnce({ data: updatedSettings });

      const { result } = renderHook(() => useUpdateTeamSettings(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ cycleDurationWeeks: 3 });
      });

      const cached = queryClient.getQueryData<TeamSettings>(teamKeys.settings(workspaceId, teamId));
      expect(cached?.cycleDurationWeeks).toBe(3);
   });
});

describe('team workflow status hooks', () => {
   it('fetches workflow statuses', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({ data: sampleStatuses });

      const { result } = renderHook(() => useTeamStatuses(workspaceId, teamId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(sampleStatuses);
      expect(mocks.get).toHaveBeenCalledWith(
         `/api/v1/workspaces/${workspaceId}/teams/${teamId}/statuses`,
         expect.anything(),
         expect.anything()
      );
   });

   it('creates a workflow status and appends to status list', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.statuses(workspaceId, teamId), sampleStatuses);

      const newStatus: TeamStatus = {
         id: 'stat-3',
         teamId,
         name: 'In Progress',
         category: 'STARTED',
         position: 2,
         isDefault: false,
      };
      mocks.post.mockResolvedValueOnce({ data: newStatus });

      const { result } = renderHook(() => useCreateTeamStatus(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ name: 'In Progress', category: 'STARTED' });
      });

      const cached = queryClient.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(cached).toHaveLength(3);
      expect(cached?.[2]?.name).toBe('In Progress');
   });

   it('reorders workflow statuses', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.statuses(workspaceId, teamId), sampleStatuses);

      const reordered: TeamStatus[] = [
         { ...sampleStatuses[1]!, position: 0 },
         { ...sampleStatuses[0]!, position: 1 },
      ];
      mocks.post.mockResolvedValueOnce({ data: reordered });

      const { result } = renderHook(() => useReorderTeamStatuses(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ statusIds: ['stat-2', 'stat-1'] });
      });

      const cached = queryClient.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(cached?.[0]?.id).toBe('stat-2');
   });

   it('updates workflow status name and category', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.statuses(workspaceId, teamId), sampleStatuses);

      const updated: TeamStatus = { ...sampleStatuses[0]!, name: 'Ideas' };
      mocks.patch.mockResolvedValueOnce({ data: updated });

      const { result } = renderHook(() => useUpdateTeamStatus(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ statusId: 'stat-1', input: { name: 'Ideas' } });
      });

      const cached = queryClient.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(cached?.[0]?.name).toBe('Ideas');
   });

   it('designates a new default status and unsets previous default', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.statuses(workspaceId, teamId), sampleStatuses);

      const defaultUpdated: TeamStatus = { ...sampleStatuses[0]!, isDefault: true };
      mocks.post.mockResolvedValueOnce({ data: defaultUpdated });

      const { result } = renderHook(() => useSetDefaultTeamStatus(workspaceId, teamId), {
         wrapper,
      });

      await act(async () => {
         await result.current.mutateAsync({ statusId: 'stat-1' });
      });

      const cached = queryClient.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(cached?.find((s) => s.id === 'stat-1')?.isDefault).toBe(true);
      expect(cached?.find((s) => s.id === 'stat-2')?.isDefault).toBe(false);
   });

   it('retires a status and removes it from status cache', async () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(teamKeys.statuses(workspaceId, teamId), sampleStatuses);

      mocks.delete.mockResolvedValueOnce({
         data: { id: 'stat-1', isDefault: false, retiredAt: '2026-01-01' },
      });

      const { result } = renderHook(() => useRetireTeamStatus(workspaceId, teamId), { wrapper });

      await act(async () => {
         await result.current.mutateAsync({ statusId: 'stat-1' });
      });

      const cached = queryClient.getQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId));
      expect(cached?.find((s) => s.id === 'stat-1')).toBeUndefined();
   });
});

describe('useTeamIssues hook', () => {
   it('fetches team issues', async () => {
      const { wrapper } = createWrapper();
      mocks.get.mockResolvedValueOnce({
         data: [{ id: 'issue-1', title: 'Issue 1', statusId: 'stat-1' }],
         meta: { total: 1, hasNext: false, limit: 50, nextCursor: null },
      });

      const { result } = renderHook(() => useTeamIssues(workspaceId, teamId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages[0]?.data).toHaveLength(1);
   });
});

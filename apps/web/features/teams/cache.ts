import type { QueryClient } from '@tanstack/react-query';
import type { Team, TeamMember, TeamSettings, TeamStatus } from './types';
import { teamKeys } from './queries';

interface PaginatedList<T> {
   pages: Array<{
      data: T[];
      meta: {
         total: number;
         hasNext: boolean;
         cursor?: string | null;
         nextCursor?: string | null;
         limit: number;
      };
   }>;
   pageParams: unknown[];
}

export function invalidateTeamLists(queryClient: QueryClient, workspaceId: string) {
   return queryClient.invalidateQueries({
      queryKey: teamKeys.list(workspaceId),
   });
}

export function prependTeamToQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   newTeam: Team
) {
   queryClient.setQueryData<PaginatedList<Team>>(teamKeys.list(workspaceId), (current) => {
      if (!current || !current.pages.length) {
         return {
            pages: [
               {
                  data: [newTeam],
                  meta: {
                     total: 1,
                     hasNext: false,
                     cursor: null,
                     nextCursor: null,
                     limit: 50,
                  },
               },
            ],
            pageParams: [undefined],
         };
      }

      const firstPage = current.pages[0]!;
      return {
         ...current,
         pages: [
            {
               ...firstPage,
               data: [newTeam, ...firstPage.data.filter((item) => item.id !== newTeam.id)],
               meta: {
                  ...firstPage.meta,
                  total: firstPage.meta.total + 1,
               },
            },
            ...current.pages.slice(1),
         ],
      };
   });

   queryClient.setQueryData<Team>(teamKeys.detail(workspaceId, newTeam.id), newTeam);
}

export function patchTeamInQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   updatedTeam: Team
) {
   queryClient.setQueryData<Team>(teamKeys.detail(workspaceId, updatedTeam.id), (existing) =>
      existing ? { ...existing, ...updatedTeam } : updatedTeam
   );

   queryClient.setQueriesData<PaginatedList<Team>>(
      { queryKey: teamKeys.list(workspaceId) },
      (current) => {
         if (!current) return current;
         return {
            ...current,
            pages: current.pages.map((page) => ({
               ...page,
               data: page.data.map((item) =>
                  item.id === updatedTeam.id ? { ...item, ...updatedTeam } : item
               ),
            })),
         };
      }
   );
}

export function removeTeamFromQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   teamId: string
) {
   queryClient.removeQueries({ queryKey: teamKeys.detail(workspaceId, teamId) });

   queryClient.setQueriesData<PaginatedList<Team>>(
      { queryKey: teamKeys.list(workspaceId) },
      (current) => {
         if (!current) return current;
         return {
            ...current,
            pages: current.pages.map((page) => ({
               ...page,
               data: page.data.filter((item) => item.id !== teamId),
               meta: {
                  ...page.meta,
                  total: Math.max(0, page.meta.total - 1),
               },
            })),
         };
      }
   );
}

export function patchTeamMembersInQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   teamId: string,
   updater: (current: TeamMember[]) => TeamMember[]
) {
   queryClient.setQueryData<TeamMember[]>(teamKeys.members(workspaceId, teamId), (current) =>
      updater(current ?? [])
   );
}

export function patchTeamSettingsInQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   teamId: string,
   updatedSettings: Partial<TeamSettings> | Team
) {
   queryClient.setQueryData<TeamSettings>(teamKeys.settings(workspaceId, teamId), (existing) => {
      const patch: Partial<TeamSettings> = {
         ...(updatedSettings.timezone !== undefined && { timezone: updatedSettings.timezone }),
         ...(updatedSettings.cyclesEnabled !== undefined && {
            cyclesEnabled: updatedSettings.cyclesEnabled,
         }),
         ...(updatedSettings.cycleDurationWeeks !== undefined && {
            cycleDurationWeeks: updatedSettings.cycleDurationWeeks,
         }),
         ...(updatedSettings.cycleStartDay !== undefined && {
            cycleStartDay: updatedSettings.cycleStartDay,
         }),
         ...(updatedSettings.cycleCooldownDays !== undefined && {
            cycleCooldownDays: updatedSettings.cycleCooldownDays,
         }),
         ...(updatedSettings.upcomingCyclesCount !== undefined && {
            upcomingCyclesCount: updatedSettings.upcomingCyclesCount,
         }),
      };
      return existing ? { ...existing, ...patch } : (patch as TeamSettings);
   });

   queryClient.setQueryData<Team>(teamKeys.detail(workspaceId, teamId), (existing) =>
      existing ? { ...existing, ...updatedSettings } : existing
   );
}

export function patchTeamStatusesInQueryCache(
   queryClient: QueryClient,
   workspaceId: string,
   teamId: string,
   updater: (current: TeamStatus[]) => TeamStatus[]
) {
   queryClient.setQueryData<TeamStatus[]>(teamKeys.statuses(workspaceId, teamId), (current) =>
      updater(current ?? [])
   );
}

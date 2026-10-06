'use client';

import { Issue } from '@/mock-data/issues';
import {
   getStatusesByCategory,
   StatusCategory,
   displayOrderedStatus,
   Status,
} from '@/mock-data/status';
import { Priority } from '@/mock-data/priorities';
import { User } from '@/mock-data/users';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useMemo } from 'react';
import { GroupedIssuesView } from './grouped-issues-view';
import { InsightsPanel } from './insights-panel';
import { SearchIssues } from './search-issues';
import { useActiveWorkspace } from '@/features/auth/hooks';
import {
   useArchiveIssue,
   useDeleteIssue,
   useIssueList,
   useRestoreIssue,
   useUpdateIssue,
} from '@/features/issues/hooks';
import {
   findTeamStatusIdForUiStatus,
   issueItemToUiIssue,
   mockToPriority,
} from '@/features/issues/mapping';
import { useTeamStatusesMap } from '@/features/teams/hooks';
import type { IssueListFilters } from '@/features/issues/queries';

interface AllIssuesProps {
   /**
    * Optional status-category filter, used by the "Active" and "Backlog"
    * tabs. When omitted, every status is shown ("All issues").
    */
   categories?: StatusCategory[];
   workspaceId?: string;
   teamId?: string;
}

export default function AllIssues({ categories, workspaceId, teamId }: AllIssuesProps) {
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const {
      issues: storeIssues,
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      deleteIssue,
   } = useIssuesStore();
   const { openPanel } = useRightPanelStore();

   const { data: activeWorkspace } = useActiveWorkspace();
   const effectiveWorkspaceId = workspaceId ?? activeWorkspace?.workspace?.id ?? '';

   const queryFilters = useMemo<IssueListFilters>(() => {
      const f: IssueListFilters = { limit: 50 };
      if (teamId) f.teamId = teamId;
      return f;
   }, [teamId]);

   const { data: serverIssuesData } = useIssueList(effectiveWorkspaceId, queryFilters);

   const updateMutation = useUpdateIssue(effectiveWorkspaceId);
   const archiveMutation = useArchiveIssue(effectiveWorkspaceId);
   const restoreMutation = useRestoreIssue(effectiveWorkspaceId);
   const deleteMutation = useDeleteIssue(effectiveWorkspaceId);

   const rawServerIssues = useMemo(
      () => serverIssuesData?.pages.flatMap((page) => page.data) ?? null,
      [serverIssuesData]
   );

   const teamIds = useMemo(
      () =>
         rawServerIssues
            ? Array.from(new Set(rawServerIssues.map((i) => i.teamId).filter(Boolean)))
            : teamId
              ? [teamId]
              : [],
      [rawServerIssues, teamId]
   );

   const teamStatusesMap = useTeamStatusesMap(effectiveWorkspaceId, teamIds);

   const serverIssues = useMemo<Issue[] | null>(() => {
      if (!rawServerIssues) return null;
      return rawServerIssues.map((item) => issueItemToUiIssue(item, teamStatusesMap));
   }, [rawServerIssues, teamStatusesMap]);

   const baseIssues = serverIssues ?? storeIssues;

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const statuses = useMemo(
      () => (categories ? getStatusesByCategory(categories) : displayOrderedStatus),
      [categories]
   );

   const scopedIssues = useMemo<Issue[]>(
      () =>
         categories
            ? baseIssues.filter((issue) => categories.includes(issue.status.category))
            : baseIssues,
      [baseIssues, categories]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
   );

   const handleStatusChange = (issue: Issue, newStatus: Status) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         const teamStatusesForIssue = issue.teamId
            ? Array.from(teamStatusesMap.values()).filter((ts) => ts.teamId === issue.teamId)
            : Array.from(teamStatusesMap.values());
         const targetStatusId =
            findTeamStatusIdForUiStatus(teamStatusesForIssue, newStatus) ?? newStatus.id;

         updateMutation.mutate({
            issueId: issue.id,
            payload: {
               expectedRevision: issue.revision,
               statusId: targetStatusId,
            },
         });
      } else {
         updateIssueStatus(issue.id, newStatus);
      }
   };

   const handlePriorityChange = (issue: Issue, newPriority: Priority) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         updateMutation.mutate({
            issueId: issue.id,
            payload: {
               expectedRevision: issue.revision,
               priority: mockToPriority[newPriority.id] ?? 'NO_PRIORITY',
            },
         });
      } else {
         updateIssuePriority(issue.id, newPriority);
      }
   };

   const handleAssigneeChange = async (issue: Issue, newAssignee: User | null) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         try {
            await updateMutation.mutateAsync({
               issueId: issue.id,
               payload: {
                  expectedRevision: issue.revision,
                  assigneeId: newAssignee?.id ?? null,
               },
            });
         } catch {
            // Handled by updateMutation.onError
         }
      } else {
         updateIssueAssignee(issue.id, newAssignee);
      }
   };

   const handleArchive = (issue: Issue) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         archiveMutation.mutate({
            issueId: issue.id,
            expectedRevision: issue.revision,
         });
      }
   };

   const handleRestore = (issue: Issue) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         restoreMutation.mutate({
            issueId: issue.id,
            expectedRevision: issue.revision,
         });
      }
   };

   const handleDelete = (issue: Issue) => {
      if (effectiveWorkspaceId && issue.revision !== undefined) {
         deleteMutation.mutate({
            issueId: issue.id,
            expectedRevision: issue.revision,
         });
      } else {
         deleteIssue(issue.id);
      }
   };

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               <SearchIssues />
            </div>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  onStatusChange={handleStatusChange}
                  onPriorityChange={handlePriorityChange}
                  onAssigneeChange={handleAssigneeChange}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                  workspaceId={effectiveWorkspaceId}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}

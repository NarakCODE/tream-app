'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, BarChart3, CheckCircle2, Filter, Loader2, Search } from 'lucide-react';
import type { IssueItem, IssueLifecycle, WorkPriority } from '@repo/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
   useArchiveIssue,
   useDeleteIssue,
   useIssueList,
   useRestoreIssue,
   useUpdateIssue,
} from './hooks';
import type { IssueListFilters } from './queries';
import { useIssueFilters } from './use-issue-filters';
import { LIFECYCLE_TABS, PRIORITY_OPTIONS, PriorityBadgeIcon } from './issue-row-icons';
import { useTeamStatusesMap } from '@/features/teams/hooks';
import { findTeamStatusIdForUiStatus, issueItemToUiIssue, mockToPriority } from './mapping';
import { Issue } from '@/mock-data/issues';
import { displayOrderedStatus, Status } from '@/mock-data/status';
import { Priority } from '@/mock-data/priorities';
import { User } from '@/mock-data/users';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { useFilterStore } from '@/store/filter-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useViewStore } from '@/store/view-store';
import { useIssuesStore } from '@/store/issues-store';

export interface IssueListProps {
   workspaceId: string;
   initialFilters?: IssueListFilters;
   className?: string;
}

export function IssueList({ workspaceId, initialFilters = {}, className }: IssueListProps) {
   const params = useParams<{ orgId?: string }>();
   const orgId = params?.orgId ?? '';
   const searchInputId = useId();

   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const { openPanel, togglePanel } = useRightPanelStore();
   const { filters } = useFilterStore();
   const { setIssues } = useIssuesStore();

   // URL query-synchronized server state with instant local state
   const urlFilters = useIssueFilters();
   const [lifecycle, setLifecycle] = useState<IssueLifecycle | undefined>(
      urlFilters.lifecycle ?? initialFilters.lifecycle
   );
   const [priority, setPriority] = useState<WorkPriority | undefined>(
      urlFilters.priority ?? initialFilters.priority
   );
   const [searchQuery, setSearchQuery] = useState(urlFilters.searchQuery || '');

   const handleLifecycleChange = (newLifecycle: IssueLifecycle | 'all') => {
      if (newLifecycle === 'all') {
         setLifecycle(undefined);
         void urlFilters.setLifecycle(null);
      } else {
         setLifecycle(newLifecycle);
         void urlFilters.setLifecycle(newLifecycle);
      }
   };

   const handlePriorityFilterChange = (newPriority: WorkPriority | undefined) => {
      setPriority(newPriority);
      void urlFilters.setPriority(newPriority);
   };

   const handleSearchChange = (query: string) => {
      setSearchQuery(query);
      void urlFilters.setSearchQuery(query);
   };

   // Mutations for server state updates
   const updateMutation = useUpdateIssue(workspaceId);
   const archiveMutation = useArchiveIssue(workspaceId);
   const restoreMutation = useRestoreIssue(workspaceId);
   const deleteMutation = useDeleteIssue(workspaceId);

   const queryFilters = useMemo<IssueListFilters>(() => {
      const f: IssueListFilters = {
         ...initialFilters,
         limit: initialFilters.limit ?? 50,
      };
      if (lifecycle) {
         f.lifecycle = lifecycle;
      }
      if (priority) {
         f.priority = priority;
      }
      return f;
   }, [initialFilters, lifecycle, priority]);

   const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
      useIssueList(workspaceId, queryFilters);

   const allIssues = useMemo<IssueItem[]>(
      () => data?.pages.flatMap((page) => page?.data ?? []) ?? [],
      [data]
   );

   const teamIds = useMemo(
      () => Array.from(new Set(allIssues.map((i) => i.teamId).filter(Boolean))),
      [allIssues]
   );
   const teamStatusesMap = useTeamStatusesMap(workspaceId, teamIds);

   const allUiIssues = useMemo<Issue[]>(
      () => allIssues.map((item) => issueItemToUiIssue(item, teamStatusesMap)),
      [allIssues, teamStatusesMap]
   );

   useEffect(() => {
      if (allUiIssues.length > 0) {
         setIssues(allUiIssues);
      }
   }, [allUiIssues, setIssues]);

   const displayedUiIssues = useMemo(() => {
      let result = allUiIssues;
      if (searchQuery.trim()) {
         const q = searchQuery.toLowerCase().trim();
         result = result.filter(
            (issue) =>
               issue.title.toLowerCase().includes(q) ||
               issue.identifier.toLowerCase().includes(q) ||
               issue.description?.toLowerCase().includes(q)
         );
      }
      return applyIssueFilters(result, filters);
   }, [allUiIssues, searchQuery, filters]);

   const latestMeta = data?.pages[data.pages.length - 1]?.meta;
   const totalIssues = latestMeta?.total ?? allIssues.length;

   const handleStatusChange = (issue: Issue, newStatus: Status) => {
      const teamStatusesForIssue = issue.teamId
         ? Array.from(teamStatusesMap.values()).filter((ts) => ts.teamId === issue.teamId)
         : Array.from(teamStatusesMap.values());
      const targetStatusId =
         findTeamStatusIdForUiStatus(teamStatusesForIssue, newStatus) ?? newStatus.id;

      updateMutation.mutate({
         issueId: issue.id,
         payload: {
            expectedRevision: issue.revision ?? 1,
            statusId: targetStatusId,
         },
      });
   };

   const handlePriorityChange = (issue: Issue, newPriority: Priority) => {
      updateMutation.mutate({
         issueId: issue.id,
         payload: {
            expectedRevision: issue.revision ?? 1,
            priority: mockToPriority[newPriority.id] ?? 'NO_PRIORITY',
         },
      });
   };

   const handleAssigneeChange = async (issue: Issue, newAssignee: User | null) => {
      try {
         await updateMutation.mutateAsync({
            issueId: issue.id,
            payload: {
               expectedRevision: issue.revision ?? 1,
               assigneeId: newAssignee?.id ?? null,
            },
         });
      } catch {
         // Error handled by updateMutation.onError
      }
   };

   const handleArchive = (issue: Issue) => {
      archiveMutation.mutate({
         issueId: issue.id,
         expectedRevision: issue.revision ?? 1,
      });
   };

   const handleRestore = (issue: Issue) => {
      restoreMutation.mutate({
         issueId: issue.id,
         expectedRevision: issue.revision ?? 1,
      });
   };

   const handleDelete = (issue: Issue) => {
      deleteMutation.mutate({
         issueId: issue.id,
         expectedRevision: issue.revision ?? 1,
      });
   };

   return (
      <div className={cn('flex flex-col h-full w-full bg-background overflow-hidden', className)}>
         {/* Top Header / Toolbar */}
         <header className="flex flex-col border-b border-border bg-card/60 backdrop-blur shrink-0 px-4 py-3 gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
               <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <div className="flex items-center gap-2">
                     <h1 className="text-base font-semibold tracking-tight text-foreground">
                        Issues
                     </h1>
                     <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">
                        {totalIssues}
                     </span>
                  </div>
               </div>

               {/* Right side toolbar controls */}
               <div className="flex items-center gap-2 flex-wrap">
                  {/* Lifecycle selector tabs */}
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40">
                     {LIFECYCLE_TABS.map((tab) => {
                        const isSelected = (!lifecycle && tab.key === 'all') || lifecycle === tab.key;
                        const TabIcon = tab.icon;
                        return (
                           <button
                              key={tab.key}
                              type="button"
                              onClick={() => handleLifecycleChange(tab.key)}
                              className={cn(
                                 'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
                                 isSelected
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                              )}
                           >
                              <TabIcon className="size-3.5" />
                              <span>{tab.label}</span>
                           </button>
                        );
                     })}
                  </div>

                  <IssueFilterTrigger />
                  <Button
                     size="xs"
                     variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                     onClick={() => togglePanel('insights')}
                     aria-label="Toggle insights panel"
                  >
                     <BarChart3 className="size-4" />
                  </Button>
                  <DisplayOptions />
               </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex items-center justify-between gap-2 pt-1">
               <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <div className="relative w-full">
                     <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                     <Input
                        id={searchInputId}
                        type="text"
                        placeholder="Filter issues by title or ID…"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="h-8 pl-8 text-xs bg-muted/30 focus-visible:bg-background"
                     />
                  </div>
               </div>

               <div className="flex items-center gap-2">
                  {/* Priority Filter Dropdown */}
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button
                           variant="outline"
                           size="sm"
                           className={cn(
                              'h-8 text-xs gap-1.5 border-dashed',
                              priority && 'border-solid bg-accent text-accent-foreground'
                           )}
                        >
                           <Filter className="size-3.5" />
                           <span>
                              {priority
                                 ? PRIORITY_OPTIONS.find((p) => p.key === priority)?.label
                                 : 'Priority'}
                           </span>
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs">
                           Filter by priority
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {PRIORITY_OPTIONS.map((opt) => (
                           <DropdownMenuItem
                              key={opt.key}
                              onClick={() =>
                                 handlePriorityFilterChange(opt.key === 'ALL' ? undefined : opt.key)
                              }
                              className={cn(
                                 'text-xs flex items-center gap-2 cursor-pointer',
                                 (opt.key === 'ALL' && !priority) || priority === opt.key
                                    ? 'font-medium'
                                    : ''
                              )}
                           >
                              <PriorityBadgeIcon
                                 priority={opt.key === 'ALL' ? null : opt.key}
                                 className="size-3.5"
                              />
                              <span>{opt.label}</span>
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuContent>
                  </DropdownMenu>

                  {(priority || searchQuery) && (
                     <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                           handlePriorityFilterChange(undefined);
                           handleSearchChange('');
                        }}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                     >
                        Reset
                     </Button>
                  )}
               </div>
            </div>
         </header>

         {/* Applied Filters Bar */}
         <IssueFilterBar />

         {/* Issues List Body */}
         <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isPending ? (
               <div
                  className="space-y-2 p-4 sm:p-6 overflow-y-auto"
                  role="status"
                  aria-label="Loading issues"
               >
                  {Array.from({ length: 7 }).map((_, index) => (
                     <div
                        key={index}
                        className="flex items-center gap-3 px-4 py-3 rounded-md border border-border/40 bg-card/40 animate-pulse"
                     >
                        <div className="size-4 rounded-xs bg-muted" />
                        <div className="w-16 h-3.5 rounded-xs bg-muted" />
                        <div className="flex-1 h-3.5 rounded-xs bg-muted max-w-md" />
                        <div className="w-16 h-3 rounded-xs bg-muted ml-auto" />
                     </div>
                  ))}
               </div>
            ) : isError ? (
               <div className="p-4 sm:p-6">
                  <div
                     role="alert"
                     className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-destructive/30 bg-destructive/5 text-destructive space-y-3"
                  >
                     <AlertCircle className="size-8" />
                     <div className="space-y-1">
                        <p className="text-sm font-medium">Failed to load issues</p>
                        <p className="text-xs text-muted-foreground">
                           There was an error communicating with the issues API.
                        </p>
                     </div>
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetch()}
                        className="mt-2 text-xs"
                     >
                        Try again
                     </Button>
                  </div>
               </div>
            ) : allIssues.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mb-4 text-muted-foreground">
                     <CheckCircle2 className="size-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">No issues found</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                     {searchQuery
                        ? `No issues match "${searchQuery}". Try adjusting your search or filters.`
                        : lifecycle
                          ? `There are currently no ${lifecycle} issues in this workspace.`
                          : 'There are currently no issues in this workspace.'}
                  </p>
               </div>
            ) : (
               <div className="flex-1 min-h-0 w-full flex overflow-hidden">
                  <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
                     <div className="flex-1 min-h-0 overflow-hidden">
                        <GroupedIssuesView
                           issues={displayedUiIssues}
                           totalIssues={allUiIssues}
                           statuses={displayOrderedStatus}
                           isViewTypeGrid={isViewTypeGrid}
                           onStatusChange={handleStatusChange}
                           onPriorityChange={handlePriorityChange}
                           onAssigneeChange={handleAssigneeChange}
                           onArchive={handleArchive}
                           onRestore={handleRestore}
                           onDelete={handleDelete}
                           workspaceId={workspaceId}
                        />
                     </div>

                     {/* Pagination Controls */}
                     {hasNextPage && (
                        <div className="shrink-0 flex justify-center py-3 border-t bg-container">
                           <Button
                              variant="outline"
                              size="sm"
                              disabled={isFetchingNextPage}
                              onClick={() => void fetchNextPage()}
                              className="text-xs gap-2"
                           >
                              {isFetchingNextPage ? (
                                 <>
                                    <Loader2 className="size-3.5 animate-spin" />
                                    <span>Loading more issues…</span>
                                 </>
                              ) : (
                                 <span>Load more issues</span>
                              )}
                           </Button>
                        </div>
                     )}
                  </div>

                  {openPanel === 'insights' && (
                     <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                        <InsightsPanel issues={displayedUiIssues} />
                     </aside>
                  )}
               </div>
            )}
         </main>
      </div>
   );
}

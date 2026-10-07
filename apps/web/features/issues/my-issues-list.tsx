'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
   AlertCircle,
   BarChart3,
   CheckCircle2,
   Filter,
   FolderKanban,
   Loader2,
   PanelRight,
   RotateCcw,
   Search,
} from 'lucide-react';
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
import { useActiveWorkspace } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';
import {
   useArchiveIssue,
   useDeleteIssue,
   useIssueList,
   useRestoreIssue,
   useUpdateIssue,
} from './hooks';
import { LIFECYCLE_TABS, PRIORITY_OPTIONS } from './issue-row-icons';
import type { IssueListFilters } from './queries';
import { useTeamStatusesMap } from '@/features/teams/hooks';
import { MY_ISSUES_TAB_ITEMS, type MyIssuesTab, useMyIssuesFilters } from './use-my-issues-filters';
import { findTeamStatusIdForUiStatus, issueItemToUiIssue, mockToPriority } from './mapping';
import { Issue } from '@/mock-data/issues';
import { displayOrderedStatus, Status } from '@/mock-data/status';
import { Priority } from '@/mock-data/priorities';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { BreakdownPanel } from '@/components/common/my-issues/breakdown-panel';
import { DisplayOptions } from '@/components/layout/headers/display-options';
import { useFilterStore } from '@/store/filter-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useViewStore } from '@/store/view-store';
import { useIssuesStore } from '@/store/issues-store';

export interface MyIssuesListProps {
   workspaceId: string;
   currentMemberId?: string;
   initialTab?: MyIssuesTab;
   initialFilters?: IssueListFilters;
   className?: string;
}

export function MyIssuesList({
   workspaceId,
   currentMemberId,
   initialTab = 'all',
   initialFilters = {},
   className,
}: MyIssuesListProps) {
   const searchInputId = useId();
   const activeWorkspace = useActiveWorkspace();

   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const { openPanel, togglePanel } = useRightPanelStore();
   const { filters } = useFilterStore();
   const { setIssues } = useIssuesStore();

   const effectiveMemberId = currentMemberId ?? activeWorkspace.data?.membership?.id ?? undefined;

   // URL query-synchronized server state with instant local state
   const urlFilters = useMyIssuesFilters();
   const [tab, setTab] = useState<MyIssuesTab>(urlFilters.tab ?? initialTab ?? 'all');
   const [lifecycle, setLifecycle] = useState<IssueLifecycle | undefined>(
      urlFilters.lifecycle ?? initialFilters.lifecycle
   );
   const [priority, setPriority] = useState<WorkPriority | undefined>(
      urlFilters.priority ?? initialFilters.priority
   );
   const [searchQuery, setSearchQuery] = useState(urlFilters.searchQuery || '');

   const handleTabChange = (newTab: MyIssuesTab) => {
      setTab(newTab);
      void urlFilters.setTab(newTab);
   };

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

   // Construct query filters based on current tab and user membership
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

      if (effectiveMemberId) {
         if (tab === 'assigned') {
            f.assigneeId = effectiveMemberId;
         } else if (tab === 'created') {
            f.createdById = effectiveMemberId;
         }
      }

      return f;
   }, [initialFilters, lifecycle, priority, effectiveMemberId, tab]);

   const {
      data,
      isPending,
      isError,
      refetch,
      fetchNextPage,
      hasNextPage,
      isFetching,
      isFetchingNextPage,
      isFetchNextPageError,
   } = useIssueList(workspaceId, queryFilters);

   const isFetchingNextPageRef = useRef(false);
   const loadNextPage = useCallback(() => {
      if (!hasNextPage || isFetching || isFetchingNextPageRef.current) return;

      isFetchingNextPageRef.current = true;
      void fetchNextPage({ cancelRefetch: false }).then(
         () => {
            isFetchingNextPageRef.current = false;
         },
         () => {
            isFetchingNextPageRef.current = false;
         }
      );
   }, [fetchNextPage, hasNextPage, isFetching]);

   const allIssues = useMemo<IssueItem[]>(() => {
      const issues = data?.pages.flatMap((page) => page?.data ?? []) ?? [];

      if (tab === 'subscribed' && effectiveMemberId) {
         return issues.filter(
            (issue) =>
               issue.assigneeId === effectiveMemberId || issue.createdById === effectiveMemberId
         );
      }

      if (tab === 'activity') {
         return [...issues].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
         );
      }

      return issues;
   }, [data, tab, effectiveMemberId]);

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

   const getEmptyStateDescription = () => {
      if (searchQuery.trim()) {
         return `No issues matching "${searchQuery}" in your ${tab} list.`;
      }
      const lifecycleText = lifecycle ? ` ${lifecycle}` : '';
      switch (tab) {
         case 'all':
            return lifecycle
               ? `No ${lifecycle} issues found in this workspace.`
               : 'No issues found in this workspace.';
         case 'assigned':
            return lifecycle === 'active'
               ? "You're all caught up! There are no active issues assigned to you."
               : `No${lifecycleText} issues assigned to you.`;
         case 'created':
            return `You haven't created any${lifecycleText} issues.`;
         case 'subscribed':
            return `You are not subscribed to any${lifecycleText} issues.`;
         case 'activity':
         default:
            return `No issue activity found for your account.`;
      }
   };

   return (
      <div className={cn('flex flex-col h-full w-full bg-background overflow-hidden', className)}>
         {/* Top Header / Toolbar */}
         <header className="flex flex-col border-b border-border bg-card/60 backdrop-blur shrink-0 px-4 py-3 gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
               <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <div className="flex items-center gap-2">
                     <FolderKanban className="size-4 text-muted-foreground" />
                     <h1 className="text-base font-semibold tracking-tight text-foreground">
                        My issues
                     </h1>
                     <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">
                        {totalIssues}
                     </span>
                  </div>
               </div>

               {/* Right side controls */}
               <div className="flex items-center gap-2 flex-wrap">
                  {/* My Issues Scope Tabs */}
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40">
                     {MY_ISSUES_TAB_ITEMS.map((item) => {
                        const isSelected = tab === item.value;
                        return (
                           <button
                              key={item.value}
                              type="button"
                              onClick={() => handleTabChange(item.value)}
                              className={cn(
                                 'px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
                                 isSelected
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                              )}
                           >
                              {item.label}
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
                  <Button
                     size="xs"
                     variant={openPanel === 'breakdown' ? 'secondary' : 'ghost'}
                     onClick={() => togglePanel('breakdown')}
                     aria-label="Toggle breakdown panel"
                  >
                     <PanelRight className="size-4" />
                  </Button>
                  <DisplayOptions />
               </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
               <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <div className="relative w-full">
                     <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                     <Input
                        id={searchInputId}
                        type="text"
                        placeholder="Filter my issues by title or ID…"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="h-8 pl-8 text-xs bg-muted/30 focus-visible:bg-background"
                     />
                  </div>
               </div>

               <div className="flex items-center gap-2">
                  {/* Lifecycle selector tabs */}
                  <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-md border border-border/40">
                     {LIFECYCLE_TABS.map((ltab) => {
                        const isSelected =
                           (!lifecycle && ltab.key === 'all') || lifecycle === ltab.key;
                        const TabIcon = ltab.icon;
                        return (
                           <button
                              key={ltab.key}
                              type="button"
                              onClick={() => handleLifecycleChange(ltab.key)}
                              className={cn(
                                 'flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer',
                                 isSelected
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground'
                              )}
                           >
                              <TabIcon className="size-3" />
                              <span>{ltab.label}</span>
                           </button>
                        );
                     })}
                  </div>

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
                              className="text-xs flex items-center justify-between"
                           >
                              <span>{opt.label}</span>
                              {(priority === opt.key || (!priority && opt.key === 'ALL')) && (
                                 <CheckCircle2 className="size-3.5 text-primary" />
                              )}
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuContent>
                  </DropdownMenu>
               </div>
            </div>
         </header>

         {/* Applied Filters Bar */}
         <IssueFilterBar />

         {/* Issues List Container */}
         <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isPending ? (
               <div className="flex flex-col divide-y divide-border/60 p-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                     <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                        <div className="size-4 rounded-full bg-muted shrink-0" />
                        <div className="h-4 w-16 bg-muted rounded shrink-0" />
                        <div className="h-4 w-1/3 bg-muted rounded" />
                        <div className="ml-auto h-4 w-20 bg-muted rounded shrink-0" />
                     </div>
                  ))}
               </div>
            ) : isError && !data ? (
               <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <AlertCircle className="size-8 text-destructive mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                     Failed to load your issues
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                     An error occurred while fetching issues from the server.
                  </p>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => void refetch()}
                     className="gap-2 text-xs"
                  >
                     <RotateCcw className="size-3.5" />
                     Retry
                  </Button>
               </div>
            ) : allIssues.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                  <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                     <FolderKanban className="size-6 text-muted-foreground/80" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">No issues found</h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                     {getEmptyStateDescription()}
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
                           onArchive={handleArchive}
                           onRestore={handleRestore}
                           onDelete={handleDelete}
                           workspaceId={workspaceId}
                           onLoadMore={
                              hasNextPage && !isFetchNextPageError ? loadNextPage : undefined
                           }
                           isInfiniteScrollBusy={isFetching}
                        />
                     </div>
                  </div>

                  {openPanel === 'insights' && (
                     <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                        <InsightsPanel issues={displayedUiIssues} />
                     </aside>
                  )}

                  {openPanel === 'breakdown' && (
                     <aside className="hidden lg:flex w-[320px] shrink-0 border-l h-full overflow-hidden bg-container">
                        <BreakdownPanel issues={displayedUiIssues} />
                     </aside>
                  )}
               </div>
            )}
            {isFetchingNextPage && (
               <div
                  role="status"
                  aria-live="polite"
                  className="shrink-0 flex items-center justify-center gap-2 border-t bg-container p-3 text-xs text-muted-foreground"
               >
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Loading more issues…</span>
               </div>
            )}
            {isFetchNextPageError && (
               <div
                  role="alert"
                  className="shrink-0 flex items-center justify-center gap-3 border-t bg-container p-3 text-xs"
               >
                  <span className="text-muted-foreground">Unable to load more issues.</span>
                  <Button variant="outline" size="sm" onClick={loadNextPage} disabled={isFetching}>
                     Try again
                  </Button>
               </div>
            )}
         </main>
      </div>
   );
}

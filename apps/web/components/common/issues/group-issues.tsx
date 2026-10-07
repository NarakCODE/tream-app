'use client';

import { Issue } from '@/mock-data/issues';
import { Status } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import { useIssuesStore } from '@/store/issues-store';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { cn } from '@/lib/utils';
import { ChevronDown, Plus } from 'lucide-react';
import { FC, ReactNode, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/button';
import { IssueDragType, IssueGrid } from './issue-grid';
import { IssueLine } from './issue-line';
import { InfiniteScrollTrigger } from './infinite-scroll-trigger';

/**
 * Generic descriptor of an issue group. Groups are usually statuses but the
 * "Display" settings also allow grouping by assignee / priority / project.
 */
export interface IssueGroupDescriptor {
   id: string;
   name: string;
   color: string;
   icon: ReactNode;
   /** Set when grouping by status: enables board drop + "+" default status. */
   status?: Status;
}

import type { Priority } from '@/mock-data/priorities';

interface GroupIssuesProps {
   group: IssueGroupDescriptor;
   /** Issues of the group, already sorted upstream. */
   issues: Issue[];
   count: number;
   onStatusChange?: (issue: Issue, newStatus: Status) => void;
   onPriorityChange?: (issue: Issue, newPriority: Priority) => void;
   onAssigneeChange?: (issue: Issue, newAssignee: User | null) => void | Promise<unknown>;
   onArchive?: (issue: Issue) => void;
   onRestore?: (issue: Issue) => void;
   onDelete?: (issue: Issue) => void;
   workspaceId?: string;
   onLoadMore?: () => void;
   isInfiniteScrollBusy?: boolean;
}

export function GroupIssues({
   group,
   issues,
   count,
   onStatusChange,
   onPriorityChange,
   onAssigneeChange,
   onArchive,
   onRestore,
   onDelete,
   workspaceId,
   onLoadMore,
   isInfiniteScrollBusy = false,
}: GroupIssuesProps) {
   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const { openModal } = useCreateIssueStore();
   const { collapsedGroups, toggleGroupCollapsed } = useDisplaySettingsStore();
   const isCollapsed = Boolean(collapsedGroups[group.id]);

   return (
      <div
         className={cn(
            'bg-container transition-all duration-200',
            isViewTypeGrid
               ? isCollapsed
                  ? 'overflow-hidden rounded-md h-full flex-shrink-0 w-12 flex flex-col select-none cursor-pointer border border-border/40 hover:border-border'
                  : 'overflow-hidden rounded-md h-full flex-shrink-0 w-[348px] flex flex-col'
               : ''
         )}
         onClick={isViewTypeGrid && isCollapsed ? () => toggleGroupCollapsed(group.id) : undefined}
      >
         <div
            className={cn(
               'sticky top-0 z-10 bg-container w-full',
               isViewTypeGrid
                  ? isCollapsed
                     ? 'h-full flex flex-col items-center py-3'
                     : 'rounded-t-md h-[50px]'
                  : 'h-10'
            )}
         >
            {isViewTypeGrid && isCollapsed ? (
               <div
                  className="w-full h-full flex flex-col items-center justify-between py-2 gap-3"
                  style={{ backgroundColor: `${group.color}10` }}
                  title={`${group.name} (${count}) - Click to expand`}
               >
                  <div className="flex flex-col items-center gap-2">
                     <button
                        type="button"
                        onClick={(e) => {
                           e.stopPropagation();
                           toggleGroupCollapsed(group.id);
                        }}
                        className="size-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                        aria-label={`Expand ${group.name}`}
                        aria-expanded={false}
                     >
                        <ChevronDown className="size-3.5 -rotate-90 transition-transform duration-200" />
                     </button>
                     {group.icon}
                     <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/40">
                        {count}
                     </span>
                  </div>

                  <span className="text-xs font-medium text-muted-foreground tracking-wide select-none [writing-mode:vertical-rl] rotate-180 truncate max-h-48">
                     {group.name}
                  </span>

                  <Button
                     className="size-6 text-muted-foreground hover:text-foreground mt-auto"
                     size="icon"
                     variant="ghost"
                     onClick={(e) => {
                        e.stopPropagation();
                        openModal(group.status);
                     }}
                     aria-label={`Add issue to ${group.name}`}
                  >
                     <Plus className="size-3.5" />
                  </Button>
               </div>
            ) : (
               <div
                  className={cn(
                     'w-full h-full flex items-center justify-between cursor-pointer select-none group/header',
                     isViewTypeGrid ? 'px-3' : 'px-6'
                  )}
                  style={{
                     backgroundColor: isViewTypeGrid ? `${group.color}10` : `${group.color}08`,
                  }}
                  onClick={() => toggleGroupCollapsed(group.id)}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     <button
                        type="button"
                        onClick={(e) => {
                           e.stopPropagation();
                           toggleGroupCollapsed(group.id);
                        }}
                        className="size-5 -ml-1 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                        aria-label={isCollapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                        aria-expanded={!isCollapsed}
                     >
                        <ChevronDown
                           className={cn(
                              'size-3.5 transition-transform duration-200',
                              isCollapsed && '-rotate-90'
                           )}
                        />
                     </button>
                     {group.icon}
                     <span className="text-sm font-medium truncate">{group.name}</span>
                     <span className="text-sm text-muted-foreground">{count}</span>
                  </div>

                  <Button
                     className="size-6 text-muted-foreground hover:text-foreground"
                     size="icon"
                     variant="ghost"
                     onClick={(e) => {
                        e.stopPropagation();
                        openModal(group.status);
                     }}
                     aria-label={`Add issue to ${group.name}`}
                  >
                     <Plus className="size-4" />
                  </Button>
               </div>
            )}
         </div>

         {viewType === 'list'
            ? !isCollapsed && (
                 <div className="space-y-0">
                    {issues.map((issue) => (
                       <IssueLine
                          key={issue.id}
                          issue={issue}
                          layoutId={true}
                          onStatusChange={onStatusChange}
                          onPriorityChange={onPriorityChange}
                          onAssigneeChange={onAssigneeChange}
                          onArchive={onArchive}
                          onRestore={onRestore}
                          onDelete={onDelete}
                          workspaceId={workspaceId}
                       />
                    ))}
                 </div>
              )
            : !isCollapsed && (
                 <IssueGridList
                    issues={issues}
                    status={group.status}
                    onStatusChange={onStatusChange}
                    onPriorityChange={onPriorityChange}
                    onAssigneeChange={onAssigneeChange}
                    onArchive={onArchive}
                    onRestore={onRestore}
                    onDelete={onDelete}
                    workspaceId={workspaceId}
                    onLoadMore={onLoadMore}
                    isInfiniteScrollBusy={isInfiniteScrollBusy}
                 />
              )}
      </div>
   );
}

const IssueGridList: FC<{
   issues: Issue[];
   status?: Status;
   onStatusChange?: (issue: Issue, newStatus: Status) => void;
   onPriorityChange?: (issue: Issue, newPriority: Priority) => void;
   onAssigneeChange?: (issue: Issue, newAssignee: User | null) => void | Promise<unknown>;
   onArchive?: (issue: Issue) => void;
   onRestore?: (issue: Issue) => void;
   onDelete?: (issue: Issue) => void;
   workspaceId?: string;
   onLoadMore?: () => void;
   isInfiniteScrollBusy?: boolean;
}> = ({
   issues,
   status,
   onStatusChange,
   onPriorityChange,
   onAssigneeChange,
   onArchive,
   onRestore,
   onDelete,
   workspaceId,
   onLoadMore,
   isInfiniteScrollBusy = false,
}) => {
   const ref = useRef<HTMLDivElement>(null);
   const { updateIssueStatus } = useIssuesStore();

   // Set up drop functionality to accept only issue items.
   const [{ isOver }, drop] = useDrop(() => ({
      accept: IssueDragType,
      canDrop: () => status !== undefined,
      drop(item: Issue, monitor) {
         if (status && monitor.didDrop() && item.status.id !== status.id) {
            if (onStatusChange) {
               onStatusChange(item, status);
            } else {
               updateIssueStatus(item.id, status);
            }
         }
      },
      collect: (monitor) => ({
         isOver: !!monitor.isOver() && !!monitor.canDrop(),
      }),
   }));
   drop(ref);

   return (
      <div
         ref={ref}
         className="flex-1 h-full overflow-y-auto p-2 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50 relative"
      >
         <AnimatePresence>
            {isOver && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="fixed top-0 left-0 right-0 bottom-0 z-10 flex items-center justify-center pointer-events-none bg-background/90"
                  style={{
                     width: ref.current?.getBoundingClientRect().width || '100%',
                     height: ref.current?.getBoundingClientRect().height || '100%',
                     transform: `translate(${ref.current?.getBoundingClientRect().left || 0}px, ${ref.current?.getBoundingClientRect().top || 0}px)`,
                  }}
               >
                  <div className="bg-background border border-border rounded-md p-3 shadow-md max-w-[90%]">
                     <p className="text-sm font-medium text-center">Drop to update status</p>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
         {issues.map((issue) => (
            <IssueGrid
               key={issue.id}
               issue={issue}
               onStatusChange={onStatusChange}
               onPriorityChange={onPriorityChange}
               onAssigneeChange={onAssigneeChange}
               onArchive={onArchive}
               onRestore={onRestore}
               onDelete={onDelete}
               workspaceId={workspaceId}
            />
         ))}
         {onLoadMore && (
            <InfiniteScrollTrigger onLoadMore={onLoadMore} isBusy={isInfiniteScrollBusy} />
         )}
      </div>
   );
};

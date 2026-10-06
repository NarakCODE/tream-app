'use client';

import { Issue } from '@/mock-data/issues';
import { getCycleById } from '@/mock-data/cycles';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { motion } from 'motion/react';
import type { Priority } from '@/mock-data/priorities';
import type { Status } from '@/mock-data/status';
import type { User } from '@/mock-data/users';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

export function IssueLine({
   issue,
   layoutId = false,
   onStatusChange,
   onPriorityChange,
   onAssigneeChange,
   onArchive,
   onRestore,
   onDelete,
   workspaceId,
}: {
   issue: Issue;
   layoutId?: boolean;
   onStatusChange?: (issue: Issue, newStatus: Status) => void;
   onPriorityChange?: (issue: Issue, newPriority: Priority) => void;
   onAssigneeChange?: (issue: Issue, newAssignee: User | null) => void | Promise<unknown>;
   onArchive?: (issue: Issue) => void;
   onRestore?: (issue: Issue) => void;
   onDelete?: (issue: Issue) => void;
   workspaceId?: string;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useDisplaySettingsStore();
   const cycle = displayProperties.cycle && issue.cycleId ? getCycleById(issue.cycleId) : undefined;
   const issueHref = orgId ? `/${orgId}/issue/${issue.identifier}` : `/issue/${issue.identifier}`;

   const handleAssigneeChange = async (newAssignee: User | null) => {
      if (onAssigneeChange) {
         await onAssigneeChange(issue, newAssignee);
      }
   };

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className="w-full flex items-center justify-start h-11 px-6 hover:bg-sidebar/50 group"
            >
               <div className="flex items-center gap-0.5">
                  {displayProperties.priority && (
                     <PrioritySelector
                        priority={issue.priority}
                        issueId={issue.id}
                        onChange={(p) => onPriorityChange?.(issue, p)}
                        ariaLabel={`Change priority from ${issue.priority?.id?.toUpperCase() ?? 'NO_PRIORITY'}`}
                     />
                  )}
                  {displayProperties.id && (
                     <span className="text-sm hidden sm:inline-block text-muted-foreground font-medium w-[66px] truncate shrink-0 mr-0.5">
                        {issue.identifier}
                     </span>
                  )}
                  {displayProperties.status && (
                     <StatusSelector
                        status={issue.status}
                        issueId={issue.id}
                        onChange={(s) => onStatusChange?.(issue, s)}
                     />
                  )}
               </div>
               <Link
                  href={issueHref}
                  className="min-w-0 flex items-center justify-start mr-1 ml-0.5 hover:text-primary transition-colors"
                  title={issue.title}
               >
                  <span className="text-xs sm:text-sm font-medium sm:font-semibold truncate">
                     {issue.title}
                  </span>
               </Link>
               <div className="flex items-center justify-end gap-2 ml-auto sm:w-fit">
                  {issue.estimate !== null && issue.estimate !== undefined && (
                     <span
                        className="font-mono px-1.5 py-0.5 rounded-sm bg-muted/80 text-muted-foreground text-[11px] shrink-0"
                        title={`Estimate: ${issue.estimate}`}
                     >
                        {issue.estimate} pts
                     </span>
                  )}
                  <div className="w-3 shrink-0"></div>
                  <div className="-space-x-5 hover:space-x-1 lg:space-x-1 items-center justify-end hidden sm:flex duration-200 transition-all">
                     {displayProperties.labels && <LabelBadge label={issue.labels} />}
                     {displayProperties.project && issue.project && (
                        <ProjectBadge project={issue.project} />
                     )}
                  </div>
                  {cycle && (
                     <span className="text-xs text-muted-foreground border border-border rounded-md px-1.5 py-0.5 shrink-0 hidden lg:inline-block">
                        {cycle.name}
                     </span>
                  )}
                  {displayProperties.dueDate && issue.dueDate && (
                     <span className="text-xs text-orange-400 shrink-0 hidden sm:inline-block">
                        Due {format(new Date(issue.dueDate), 'MMM dd')}
                     </span>
                  )}
                  {displayProperties.created && (
                     <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline-block">
                        {format(new Date(issue.createdAt), 'MMM dd')}
                     </span>
                  )}
                  {displayProperties.assignee && (
                     <AssigneeUser
                        user={issue.assignee}
                        issueId={issue.id}
                        workspaceId={workspaceId}
                        onChange={handleAssigneeChange}
                     />
                  )}
               </div>
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu
            issueId={issue.id}
            issue={issue}
            onStatusChange={onStatusChange}
            onPriorityChange={onPriorityChange}
            onAssigneeChange={onAssigneeChange}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
            workspaceId={workspaceId}
         />
      </ContextMenu>
   );
}

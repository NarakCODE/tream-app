import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
   ContextMenuContent,
   ContextMenuGroup,
   ContextMenuItem,
   ContextMenuSeparator,
   ContextMenuShortcut,
   ContextMenuSub,
   ContextMenuSubContent,
   ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
   CircleCheck,
   User as UserIcon,
   BarChart3,
   Tag,
   Folder,
   CalendarClock,
   Pencil,
   Link as LinkIcon,
   Repeat2,
   Copy as CopyIcon,
   PlusSquare,
   Flag,
   ArrowRightLeft,
   Bell,
   Star,
   AlarmClock,
   Trash2,
   CheckCircle2,
   Clock,
   FileText,
   MessageSquare,
   Clipboard,
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useIssuesStore } from '@/store/issues-store';
import { status } from '@/mock-data/status';
import { priorities } from '@/mock-data/priorities';
import { type User, users } from '@/mock-data/users';
import { labels } from '@/mock-data/labels';
import { projects } from '@/mock-data/projects';
import { toast } from 'sonner';
import { useWorkspaceId } from '@/features/workspaces/context';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { registerKnownAssignees } from '@/features/issues/mapping';

import type { Issue } from '@/mock-data/issues';
import type { Status } from '@/mock-data/status';
import type { Priority } from '@/mock-data/priorities';
import { Archive, ArchiveRestore } from 'lucide-react';

interface IssueContextMenuProps {
   issueId?: string;
   issue?: Issue;
   onStatusChange?: (issue: Issue, newStatus: Status) => void;
   onPriorityChange?: (issue: Issue, newPriority: Priority) => void;
   onAssigneeChange?: (issue: Issue, newAssignee: User | null) => void | Promise<unknown>;
   onArchive?: (issue: Issue) => void;
   onRestore?: (issue: Issue) => void;
   onDelete?: (issue: Issue) => void;
   workspaceId?: string;
}

function InnerIssueContextMenu({
   issueId,
   issue,
   onStatusChange,
   onPriorityChange,
   onAssigneeChange,
   onArchive,
   onRestore,
   onDelete,
   availableUsers = users,
}: IssueContextMenuProps & { availableUsers?: User[] }) {
   const [isSubscribed, setIsSubscribed] = useState(false);
   const [isFavorite, setIsFavorite] = useState(false);

   const {
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      updateIssue,
      deleteIssue,
      getIssueById,
   } = useIssuesStore();

   const targetIssue = issue ?? (issueId ? getIssueById(issueId) : undefined);
   const effectiveIssueId = targetIssue?.id ?? issueId;

   const handleStatusChange = (statusId: string) => {
      if (!effectiveIssueId) return;
      const newStatus = status.find((s) => s.id === statusId);
      if (newStatus) {
         if (targetIssue && onStatusChange) {
            onStatusChange(targetIssue, newStatus);
         } else {
            updateIssueStatus(effectiveIssueId, newStatus);
         }
         toast.success(`Status updated to ${newStatus.name}`);
      }
   };

   const handlePriorityChange = (priorityId: string) => {
      if (!effectiveIssueId) return;
      const newPriority = priorities.find((p) => p.id === priorityId);
      if (newPriority) {
         if (targetIssue && onPriorityChange) {
            onPriorityChange(targetIssue, newPriority);
         } else {
            updateIssuePriority(effectiveIssueId, newPriority);
         }
         toast.success(`Priority updated to ${newPriority.name}`);
      }
   };

   const handleArchive = () => {
      if (!targetIssue) return;
      if (onArchive) {
         onArchive(targetIssue);
      }
      toast.success('Issue archived');
   };

   const handleRestore = () => {
      if (!targetIssue) return;
      if (onRestore) {
         onRestore(targetIssue);
      }
      toast.success('Issue restored');
   };

   const handleDelete = () => {
      if (!targetIssue && !effectiveIssueId) return;
      if (targetIssue && onDelete) {
         onDelete(targetIssue);
      } else if (effectiveIssueId) {
         deleteIssue(effectiveIssueId);
      }
      toast.success('Issue deleted');
   };

   const handleAssigneeChange = async (userId: string | null) => {
      const targetId = effectiveIssueId ?? issueId;
      if (!targetId) return;
      const newAssignee = userId ? availableUsers.find((u) => u.id === userId) || null : null;
      if (targetIssue && onAssigneeChange) {
         await onAssigneeChange(targetIssue, newAssignee);
      } else {
         updateIssueAssignee(targetId, newAssignee);
      }
      toast.success(newAssignee ? `Assigned to ${newAssignee.name}` : 'Unassigned');
   };

   const handleLabelToggle = (labelId: string) => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      const label = labels.find((l) => l.id === labelId);

      if (!issue || !label) return;

      const hasLabel = issue.labels.some((l) => l.id === labelId);

      if (hasLabel) {
         removeIssueLabel(issueId, labelId);
         toast.success(`Removed label: ${label.name}`);
      } else {
         addIssueLabel(issueId, label);
         toast.success(`Added label: ${label.name}`);
      }
   };

   const handleProjectChange = (projectId: string | null) => {
      if (!issueId) return;
      const newProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
      updateIssueProject(issueId, newProject);
      toast.success(newProject ? `Project set to ${newProject.name}` : 'Project removed');
   };

   const handleSetDueDate = () => {
      if (!issueId) return;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      updateIssue(issueId, { dueDate: dueDate.toISOString() });
      toast.success('Due date set to 7 days from now');
   };

   const handleAddLink = () => {
      toast.success('Link added');
   };

   const handleMakeCopy = () => {
      toast.success('Issue copied');
   };

   const handleCreateRelated = () => {
      toast.success('Related issue created');
   };

   const handleMarkAs = (type: string) => {
      toast.success(`Marked as ${type}`);
   };

   const handleMove = () => {
      toast.success('Issue moved');
   };

   const handleSubscribe = () => {
      setIsSubscribed(!isSubscribed);
      toast.success(isSubscribed ? 'Unsubscribed from issue' : 'Subscribed to issue');
   };

   const handleFavorite = () => {
      setIsFavorite(!isFavorite);
      toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
   };

   const handleCopy = () => {
      if (!issueId) return;
      const issue = getIssueById(issueId);
      if (issue) {
         navigator.clipboard.writeText(issue.title);
         toast.success('Copied to clipboard');
      }
   };

   const handleRemindMe = () => {
      toast.success('Reminder set');
   };

   return (
      <ContextMenuContent className="w-64">
         <ContextMenuGroup>
            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <CircleCheck className="mr-2 size-4" /> Status
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {status.map((s) => {
                     const Icon = s.icon;
                     return (
                        <ContextMenuItem key={s.id} onClick={() => handleStatusChange(s.id)}>
                           <Icon /> {s.name}
                        </ContextMenuItem>
                     );
                  })}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <UserIcon className="mr-2 size-4" /> Assignee
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48 max-h-[300px] overflow-y-auto">
                  <ContextMenuItem onClick={() => handleAssigneeChange(null)}>
                     <UserIcon className="size-4" /> Unassigned
                  </ContextMenuItem>
                  {availableUsers.map((user) => (
                     <ContextMenuItem
                        key={user.id}
                        onClick={() => handleAssigneeChange(user.id)}
                     >
                        <Avatar className="size-4">
                           <AvatarImage src={user.avatarUrl} alt={user.name} />
                           <AvatarFallback className="text-[9px]">
                              {user.name[0]?.toUpperCase() ?? 'U'}
                           </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{user.name}</span>
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <BarChart3 className="mr-2 size-4" /> Priority
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {priorities.map((priority) => (
                     <ContextMenuItem
                        key={priority.id}
                        onClick={() => handlePriorityChange(priority.id)}
                     >
                        <priority.icon className="size-4" /> {priority.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Tag className="mr-2 size-4" /> Labels
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  {labels.map((label) => (
                     <ContextMenuItem key={label.id} onClick={() => handleLabelToggle(label.id)}>
                        <span
                           className="inline-block size-3 rounded-full"
                           style={{ backgroundColor: label.color }}
                           aria-hidden="true"
                        />
                        {label.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Folder className="mr-2 size-4" /> Project
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-64">
                  <ContextMenuItem onClick={() => handleProjectChange(null)}>
                     <Folder className="size-4" /> No Project
                  </ContextMenuItem>
                  {projects.slice(0, 5).map((project) => (
                     <ContextMenuItem
                        key={project.id}
                        onClick={() => handleProjectChange(project.id)}
                     >
                        <project.icon className="size-4" /> {project.name}
                     </ContextMenuItem>
                  ))}
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={handleSetDueDate}>
               <CalendarClock className="size-4" /> Set due date...
               <ContextMenuShortcut>D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuItem>
               <Pencil className="size-4" /> Rename...
               <ContextMenuShortcut>R</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            <ContextMenuItem onClick={handleAddLink}>
               <LinkIcon className="size-4" /> Add link...
               <ContextMenuShortcut>Ctrl L</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSub>
               <ContextMenuSubTrigger>
                  <Repeat2 className="mr-2 size-4" /> Convert into
               </ContextMenuSubTrigger>
               <ContextMenuSubContent className="w-48">
                  <ContextMenuItem>
                     <FileText className="size-4" /> Document
                  </ContextMenuItem>
                  <ContextMenuItem>
                     <MessageSquare className="size-4" /> Comment
                  </ContextMenuItem>
               </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={handleMakeCopy}>
               <CopyIcon className="size-4" /> Make a copy...
            </ContextMenuItem>
         </ContextMenuGroup>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={handleCreateRelated}>
            <PlusSquare className="size-4" /> Create related
         </ContextMenuItem>

         <ContextMenuSub>
            <ContextMenuSubTrigger>
               <Flag className="mr-2 size-4" /> Mark as
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
               <ContextMenuItem onClick={() => handleMarkAs('Completed')}>
                  <CheckCircle2 className="size-4" /> Completed
               </ContextMenuItem>
               <ContextMenuItem onClick={() => handleMarkAs('Duplicate')}>
                  <CopyIcon className="size-4" /> Duplicate
               </ContextMenuItem>
               <ContextMenuItem onClick={() => handleMarkAs("Won't Fix")}>
                  <Clock className="size-4" /> Won&apos;t Fix
               </ContextMenuItem>
            </ContextMenuSubContent>
         </ContextMenuSub>

         <ContextMenuItem onClick={handleMove}>
            <ArrowRightLeft className="size-4" /> Move
         </ContextMenuItem>

         <ContextMenuSeparator />

         <ContextMenuItem onClick={handleSubscribe}>
            <Bell className="size-4" /> {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            <ContextMenuShortcut>S</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={handleFavorite}>
            <Star className="size-4" /> {isFavorite ? 'Unfavorite' : 'Favorite'}
            <ContextMenuShortcut>F</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuItem onClick={handleCopy}>
            <Clipboard className="size-4" /> Copy
         </ContextMenuItem>

         <ContextMenuItem onClick={handleRemindMe}>
            <AlarmClock className="size-4" /> Remind me
            <ContextMenuShortcut>H</ContextMenuShortcut>
         </ContextMenuItem>

         <ContextMenuSeparator />

         {targetIssue?.archivedAt ? (
            <ContextMenuItem onClick={handleRestore}>
               <ArchiveRestore className="size-4" /> Restore to active
            </ContextMenuItem>
         ) : (
            <ContextMenuItem onClick={handleArchive}>
               <Archive className="size-4" /> Archive...
            </ContextMenuItem>
         )}

         <ContextMenuItem variant="destructive" onClick={handleDelete}>
            <Trash2 className="size-4" /> Delete...
            <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
         </ContextMenuItem>
      </ContextMenuContent>
   );
}

function ConnectedIssueContextMenu(props: IssueContextMenuProps) {
   const domainWorkspaceId = useWorkspaceId(props.workspaceId);
   const { data: membersData } = useWorkspaceMembers(domainWorkspaceId, 100);

   const dynamicUsers = useMemo<User[]>(() => {
      if (!membersData?.pages) return [];
      const allMembers = membersData.pages.flatMap((page) => page?.data ?? []);
      return allMembers
         .filter((m) => m && m.state === 'ACTIVE' && m.role !== 'GUEST')
         .map((m) => {
            const displayName =
               m.user?.name?.trim() ||
               (m.user?.email ? m.user.email.split('@')[0] : '') ||
               (m.role === 'OWNER' ? 'Owner' : 'Member');
            return {
               id: m.id,
               name: displayName,
               email: m.user?.email || '',
               avatarUrl:
                  m.user?.avatarUrl ||
                  `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(m.id)}`,
               status: 'online' as const,
               role: (m.role === 'OWNER' || m.role === 'ADMIN' ? 'Admin' : 'Member') as User['role'],
               joinedDate: m.createdAt,
               timezone: 'UTC',
               teamIds: [],
            };
         });
   }, [membersData]);

   useEffect(() => {
      if (dynamicUsers.length > 0) {
         registerKnownAssignees(dynamicUsers);
      }
   }, [dynamicUsers]);

   const availableUsers = useMemo(() => {
      if (dynamicUsers.length > 0) return dynamicUsers;
      return users;
   }, [dynamicUsers]);

   return <InnerIssueContextMenu {...props} availableUsers={availableUsers} />;
}

export function IssueContextMenu(props: IssueContextMenuProps) {
   const queryClient = useContext(QueryClientContext);
   if (!queryClient) {
      return <InnerIssueContextMenu {...props} availableUsers={users} />;
   }
   return <ConnectedIssueContextMenu {...props} />;
}

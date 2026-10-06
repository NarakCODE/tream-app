'use client';

import { useContext, useMemo, useState, useEffect } from 'react';
import {
   QueryClientContext,
   useQueryClient,
   type InfiniteData,
   type QueryClient,
} from '@tanstack/react-query';
import { CheckIcon, CircleUserRound, Send, UserIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusUserColors, User, users } from '@/mock-data/users';
import { useWorkspaceId } from '@/features/workspaces/context';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { useUpdateIssue } from '@/features/issues/hooks';
import { issueKeys } from '@/features/issues/queries';
import { registerKnownAssignees } from '@/features/issues/mapping';
import { useIssuesStore } from '@/store/issues-store';
import type { IssueListResponse, IssueItem } from '@repo/schemas';
import { cn } from '@/lib/utils';

export interface AssigneeUserProps {
   user: User | null;
   issueId?: string;
   workspaceId?: string;
   onChange?: (user: User | null) => void | Promise<unknown>;
   isPending?: boolean;
   disabled?: boolean;
   className?: string;
}

function findIssueRevisionInCache(
   client: QueryClient,
   workspaceId: string,
   issueId: string
): number {
   const detail = client.getQueryData<IssueItem>(issueKeys.detail(workspaceId, issueId));
   if (typeof detail?.revision === 'number') return detail.revision;
   const lists = client.getQueriesData<InfiniteData<IssueListResponse>>({
      queryKey: issueKeys.lists(workspaceId),
   });
   for (const [, data] of lists) {
      if (data?.pages) {
         for (const page of data.pages) {
            const found = page.data.find((item) => item.id === issueId);
            if (typeof found?.revision === 'number') return found.revision;
         }
      }
   }
   return 1;
}

function StaticAssigneeUser({
   user,
   issueId,
   onChange,
   isPending = false,
   disabled = false,
   className,
}: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   const [currentAssignee, setCurrentAssignee] = useState<User | null>(user);
   const [isAssigning, setIsAssigning] = useState(false);
   const { updateIssueAssignee } = useIssuesStore();

   const effectivePending = Boolean(isPending || isAssigning);

   useEffect(() => {
      setCurrentAssignee(user);
   }, [user]);

   const handleAssigneeSelect = async (newAssignee: User | null) => {
      setOpen(false);
      setIsAssigning(true);
      try {
         if (onChange) {
            await onChange(newAssignee);
         }
         setCurrentAssignee(newAssignee);
         if (issueId) {
            updateIssueAssignee(issueId, newAssignee);
         }
      } catch {
         // Handled by caller
      } finally {
         setIsAssigning(false);
      }
   };

   const renderAvatar = () => {
      if (effectivePending) {
         return (
            <div className="size-6 flex items-center justify-center">
               <Spinner className="size-4 text-muted-foreground" />
            </div>
         );
      }
      if (currentAssignee) {
         return (
            <Avatar className="size-6 shrink-0">
               <AvatarImage src={currentAssignee.avatarUrl} alt={currentAssignee.name} />
               <AvatarFallback className="text-[10px]">
                  {currentAssignee.name[0]?.toUpperCase() ?? 'U'}
               </AvatarFallback>
            </Avatar>
         );
      }
      return (
         <div className="size-6 flex items-center justify-center">
            <CircleUserRound className="size-5 text-muted-foreground" />
         </div>
      );
   };

   const statusColor =
      currentAssignee?.status && statusUserColors[currentAssignee.status]
         ? statusUserColors[currentAssignee.status]
         : '#00cc66';

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild disabled={disabled || effectivePending}>
            <button
               className={cn(
                  'relative w-fit focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                  className
               )}
               aria-label={
                  effectivePending
                     ? 'Updating assignee…'
                     : currentAssignee
                       ? `Assigned to ${currentAssignee.name}`
                       : 'No assignee'
               }
               aria-busy={effectivePending}
            >
               {renderAvatar()}
               {currentAssignee && !effectivePending && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusColor }}
                  >
                     <span className="sr-only">{currentAssignee.status}</span>
                  </span>
               )}
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[220px] max-h-[380px] overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to...</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(e) => {
                  e.stopPropagation();
                  void handleAssigneeSelect(null);
               }}
               className="cursor-pointer"
            >
               <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">No assignee</span>
               </div>
               {!currentAssignee && <CheckIcon className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {users.map((u) => (
               <DropdownMenuItem
                  key={u.id}
                  onClick={(e) => {
                     e.stopPropagation();
                     void handleAssigneeSelect(u);
                  }}
                  className="cursor-pointer"
               >
                  <div className="flex items-center gap-2 min-w-0">
                     <Avatar className="h-5 w-5 shrink-0">
                        <AvatarImage src={u.avatarUrl} alt={u.name} />
                        <AvatarFallback className="text-[10px]">
                           {u.name[0]?.toUpperCase() ?? 'U'}
                        </AvatarFallback>
                     </Avatar>
                     <span className="truncate text-xs">{u.name}</span>
                  </div>
                  {currentAssignee?.id === u.id && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
               </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">New user</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
               }}
               className="cursor-pointer"
            >
               <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Invite and assign...</span>
               </div>
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

function ConnectedAssigneeUser({
   user,
   issueId,
   workspaceId,
   onChange,
   isPending = false,
   disabled = false,
   className,
}: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   const [currentAssignee, setCurrentAssignee] = useState<User | null>(user);
   const [isAssigning, setIsAssigning] = useState(false);
   const { updateIssueAssignee } = useIssuesStore();

   const domainWorkspaceId = useWorkspaceId(workspaceId);
   const effectiveWorkspaceId = workspaceId || domainWorkspaceId;
   const queryClient = useQueryClient();
   const updateMutation = useUpdateIssue(effectiveWorkspaceId);

   const { data: membersData, isLoading: isLoadingMembers } = useWorkspaceMembers(
      effectiveWorkspaceId,
      100
   );

   const isMutationPendingForThisIssue = Boolean(
      issueId && updateMutation.isPending && updateMutation.variables?.issueId === issueId
   );

   const effectivePending = Boolean(isPending || isAssigning || isMutationPendingForThisIssue);

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
               id: m.id, // membershipId used as issue.assigneeId
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

   useEffect(() => {
      if (!user) {
         setCurrentAssignee(null);
         return;
      }
      const matched = dynamicUsers.find((u) => u.id === user.id);
      setCurrentAssignee((prev) => {
         if (matched && (!prev || prev.name === 'Assignee')) {
            return matched;
         }
         if (user.id !== prev?.id) {
            return matched || user;
         }
         return prev;
      });
   }, [user, dynamicUsers]);

   const handleAssigneeSelect = async (newAssignee: User | null) => {
      setOpen(false);
      setIsAssigning(true);
      try {
         if (onChange) {
            await onChange(newAssignee);
         } else if (issueId && effectiveWorkspaceId) {
            const expectedRevision = findIssueRevisionInCache(
               queryClient,
               effectiveWorkspaceId,
               issueId
            );
            await updateMutation.mutateAsync({
               issueId,
               payload: {
                  expectedRevision,
                  assigneeId: newAssignee?.id ?? null,
               },
            });
         }
         setCurrentAssignee(newAssignee);
         if (issueId) {
            updateIssueAssignee(issueId, newAssignee);
         }
      } catch {
         // Handled by updateMutation toast or caller
      } finally {
         setIsAssigning(false);
      }
   };

   const renderAvatar = () => {
      if (effectivePending) {
         return (
            <div className="size-6 flex items-center justify-center">
               <Spinner className="size-4 text-muted-foreground" />
            </div>
         );
      }
      if (currentAssignee) {
         return (
            <Avatar className="size-6 shrink-0">
               <AvatarImage src={currentAssignee.avatarUrl} alt={currentAssignee.name} />
               <AvatarFallback className="text-[10px]">
                  {currentAssignee.name[0]?.toUpperCase() ?? 'U'}
               </AvatarFallback>
            </Avatar>
         );
      }
      return (
         <div className="size-6 flex items-center justify-center">
            <CircleUserRound className="size-5 text-muted-foreground" />
         </div>
      );
   };

   const statusColor =
      currentAssignee?.status && statusUserColors[currentAssignee.status]
         ? statusUserColors[currentAssignee.status]
         : '#00cc66';

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild disabled={disabled || effectivePending}>
            <button
               className={cn(
                  'relative w-fit focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                  className
               )}
               aria-label={
                  effectivePending
                     ? 'Updating assignee…'
                     : currentAssignee
                       ? `Assigned to ${currentAssignee.name}`
                       : 'No assignee'
               }
               aria-busy={effectivePending}
            >
               {renderAvatar()}
               {currentAssignee && !effectivePending && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusColor }}
                  >
                     <span className="sr-only">{currentAssignee.status}</span>
                  </span>
               )}
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[220px] max-h-[380px] overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Assign to...</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(e) => {
                  e.stopPropagation();
                  void handleAssigneeSelect(null);
               }}
               className="cursor-pointer"
            >
               <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">No assignee</span>
               </div>
               {!currentAssignee && <CheckIcon className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isLoadingMembers && availableUsers.length === 0 ? (
               <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                  <Spinner className="size-3.5" />
                  <span>Loading members…</span>
               </div>
            ) : (
               availableUsers.map((u) => (
                  <DropdownMenuItem
                     key={u.id}
                     onClick={(e) => {
                        e.stopPropagation();
                        void handleAssigneeSelect(u);
                     }}
                     className="cursor-pointer"
                  >
                     <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-5 w-5 shrink-0">
                           <AvatarImage src={u.avatarUrl} alt={u.name} />
                           <AvatarFallback className="text-[10px]">
                              {u.name[0]?.toUpperCase() ?? 'U'}
                           </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs">{u.name}</span>
                     </div>
                     {currentAssignee?.id === u.id && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
               ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">New user</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
               }}
               className="cursor-pointer"
            >
               <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Invite and assign...</span>
               </div>
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

export function AssigneeUser(props: AssigneeUserProps) {
   const queryClient = useContext(QueryClientContext);
   if (!queryClient) {
      return <StaticAssigneeUser {...props} />;
   }
   return <ConnectedAssigneeUser {...props} />;
}

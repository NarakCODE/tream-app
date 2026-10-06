'use client';

import { useContext, useMemo, useEffect, useId, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { User, users } from '@/mock-data/users';
import { CheckIcon, Loader2, UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspaceId } from '@/features/workspaces/context';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { registerKnownAssignees } from '@/features/issues/mapping';

interface AssigneeSelectorProps {
   assignee: User | null;
   onChange: (assignee: User | null) => void;
   workspaceId?: string;
}

function StaticAssigneeSelector({ assignee, onChange }: AssigneeSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string | null>(assignee?.id || null);
   const { filterByAssignee } = useIssuesStore();

   useEffect(() => {
      setValue(assignee?.id || null);
   }, [assignee]);

   const selectedUser = useMemo(() => {
      if (!value) return null;
      return users.find((user) => user.id === value) || assignee;
   }, [value, assignee]);

   const handleAssigneeChange = (userId: string) => {
      if (userId === 'unassigned') {
         setValue(null);
         onChange(null);
      } else {
         setValue(userId);
         const newAssignee = users.find((u) => u.id === userId);
         if (newAssignee) {
            onChange(newAssignee);
         }
      }
      setOpen(false);
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="xs"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={open}
               >
                  {selectedUser ? (
                     <Avatar className="size-5">
                        <AvatarImage src={selectedUser.avatarUrl} alt={selectedUser.name} />
                        <AvatarFallback className="text-[10px]">
                           {selectedUser.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                     </Avatar>
                  ) : (
                     <UserCircle className="size-5" />
                  )}
                  <span>{selectedUser ? selectedUser.name : 'Unassigned'}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Assign to..." />
                  <CommandList>
                     <CommandEmpty>No users found.</CommandEmpty>
                     <CommandGroup>
                        <CommandItem
                           value="unassigned"
                           onSelect={() => handleAssigneeChange('unassigned')}
                           className="flex items-center justify-between"
                        >
                           <div className="flex items-center gap-2">
                              <UserCircle className="size-5" />
                              Unassigned
                           </div>
                           {value === null && <CheckIcon size={16} className="ml-auto" />}
                           <span className="text-muted-foreground text-xs">
                              {filterByAssignee(null).length}
                           </span>
                        </CommandItem>
                        {users.map((user) => (
                           <CommandItem
                              key={user.id}
                              value={user.name}
                              onSelect={() => handleAssigneeChange(user.id)}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2 min-w-0">
                                 <Avatar className="size-5 shrink-0">
                                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                                    <AvatarFallback className="text-[10px]">
                                       {user.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                 </Avatar>
                                 <span className="truncate">{user.name}</span>
                              </div>
                              {value === user.id && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {filterByAssignee(user.id).length}
                              </span>
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}

function ConnectedAssigneeSelector({
   assignee,
   onChange,
   workspaceId,
}: AssigneeSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string | null>(assignee?.id || null);

   const { filterByAssignee } = useIssuesStore();

   const domainWorkspaceId = useWorkspaceId(workspaceId);
   const { data: membersData, isLoading: isLoadingMembers } = useWorkspaceMembers(
      domainWorkspaceId,
      100
   );

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

   useEffect(() => {
      setValue(assignee?.id || null);
   }, [assignee]);

   const selectedUser = useMemo(() => {
      if (!value) return null;
      return availableUsers.find((user) => user.id === value) || assignee;
   }, [value, availableUsers, assignee]);

   const handleAssigneeChange = (userId: string) => {
      if (userId === 'unassigned') {
         setValue(null);
         onChange(null);
      } else {
         setValue(userId);
         const newAssignee = availableUsers.find((u) => u.id === userId);
         if (newAssignee) {
            onChange(newAssignee);
         }
      }
      setOpen(false);
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="xs"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={open}
               >
                  {selectedUser ? (
                     <Avatar className="size-5">
                        <AvatarImage src={selectedUser.avatarUrl} alt={selectedUser.name} />
                        <AvatarFallback className="text-[10px]">
                           {selectedUser.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                     </Avatar>
                  ) : (
                     <UserCircle className="size-5" />
                  )}
                  <span>{selectedUser ? selectedUser.name : 'Unassigned'}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Assign to..." />
                  <CommandList>
                     <CommandEmpty>No users found.</CommandEmpty>
                     <CommandGroup>
                        <CommandItem
                           value="unassigned"
                           onSelect={() => handleAssigneeChange('unassigned')}
                           className="flex items-center justify-between"
                        >
                           <div className="flex items-center gap-2">
                              <UserCircle className="size-5" />
                              Unassigned
                           </div>
                           {value === null && <CheckIcon size={16} className="ml-auto" />}
                           <span className="text-muted-foreground text-xs">
                              {filterByAssignee(null).length}
                           </span>
                        </CommandItem>
                        {isLoadingMembers && availableUsers.length === 0 ? (
                           <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Loading members…</span>
                           </div>
                        ) : (
                           availableUsers.map((user) => (
                              <CommandItem
                                 key={user.id}
                                 value={user.name}
                                 onSelect={() => handleAssigneeChange(user.id)}
                                 className="flex items-center justify-between"
                              >
                                 <div className="flex items-center gap-2 min-w-0">
                                    <Avatar className="size-5 shrink-0">
                                       <AvatarImage src={user.avatarUrl} alt={user.name} />
                                       <AvatarFallback className="text-[10px]">
                                          {user.name.charAt(0).toUpperCase()}
                                       </AvatarFallback>
                                    </Avatar>
                                    <span className="truncate">{user.name}</span>
                                 </div>
                                 {value === user.id && <CheckIcon size={16} className="ml-auto" />}
                                 <span className="text-muted-foreground text-xs">
                                    {filterByAssignee(user.id).length}
                                 </span>
                              </CommandItem>
                           ))
                        )}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}

export function AssigneeSelector(props: AssigneeSelectorProps) {
   const queryClient = useContext(QueryClientContext);
   if (!queryClient) {
      return <StaticAssigneeSelector {...props} />;
   }
   return <ConnectedAssigneeSelector {...props} />;
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
   MoreHorizontal,
   Shield,
   SquareUser,
   Trash2,
   UserCheck,
   UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Membership, MembershipRole, MembershipState } from '@repo/schemas';
import type { User } from '@/mock-data/users';
import { useRemoveWorkspaceMember, useUpdateWorkspaceMember } from '@/features/workspaces/hooks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuSeparator,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getRandomAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export interface MemberLineProps {
   membership?: Membership;
   user?: User;
   teams?: string[];
   workspaceId?: string;
}

/** "mason.carter" → "Mason Carter" (Linear shows display name + handle). */
const displayNameOf = (name: string) => {
   if (!name) return '';
   return name
      .split(' ')
      .map((part) =>
         part
            .split('.')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ')
      )
      .join(' ');
};

/** Linear-style joined date: current year → "Mar 17", otherwise "Oct 2023". */
const joinedLabel = (iso: string) => {
   if (!iso) return '';
   try {
      const date = parseISO(iso);
      if (isNaN(date.getTime())) return '';
      const currentYear = new Date().getFullYear();
      return date.getFullYear() === currentYear ? format(date, 'MMM d') : format(date, 'MMM yyyy');
   } catch {
      return '';
   }
};

const hashString = (value: string): number => {
   let hash = 0;
   for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
   return hash;
};

export default function MemberLine({
   membership,
   user,
   teams,
   workspaceId,
}: MemberLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const updateMember = useUpdateWorkspaceMember(workspaceId);
   const removeMember = useRemoveWorkspaceMember(workspaceId);

   const id = membership?.id ?? user?.id ?? '';
   const rawName = membership?.user?.name || user?.name || '';
   const email = membership?.user?.email || user?.email || '';
   const rawRole = membership?.role || user?.role || 'MEMBER';
   const isSuspended = membership?.state === 'SUSPENDED';

   const roleLabel = isSuspended
      ? 'Suspended'
      : rawRole === 'OWNER'
        ? 'Owner'
        : rawRole === 'ADMIN' || rawRole === 'Admin'
          ? 'Admin'
          : rawRole === 'MEMBER' || rawRole === 'Member'
            ? 'Member'
            : rawRole === 'GUEST' || rawRole === 'Guest'
              ? 'Guest'
              : rawRole;

   const isOwnerOrAdmin =
      !isSuspended && (rawRole === 'OWNER' || rawRole === 'ADMIN' || rawRole === 'Admin');
   const isApplication = rawRole === 'Application';
   const joinedDate = membership?.createdAt ?? user?.joinedDate ?? '';
   const teamList = teams ?? user?.teamIds ?? [];
   const avatarUrl =
      (membership ? membership.user?.avatarUrl : user?.avatarUrl) ||
      getRandomAvatarUrl(id || email);
   const displayName = rawName ? displayNameOf(rawName) : email;
   const showEmailAsName = !isApplication && (Boolean(email && !rawName) || hashString(id) % 4 === 0);

   const isPending = updateMember.isPending || removeMember.isPending;

   const handleUpdateRole = async (newRole: MembershipRole) => {
      if (!membership || newRole === membership.role) return;
      try {
         await updateMember.mutateAsync({
            membershipId: membership.id,
            input: { role: newRole },
            key: crypto.randomUUID(),
            workspaceId,
         });
         toast.success(`Role updated to ${newRole.charAt(0) + newRole.slice(1).toLowerCase()}`);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Failed to update member role');
      }
   };

   const handleUpdateState = async (newState: MembershipState) => {
      if (!membership || newState === membership.state) return;
      try {
         await updateMember.mutateAsync({
            membershipId: membership.id,
            input: { state: newState },
            key: crypto.randomUUID(),
            workspaceId,
         });
         toast.success(newState === 'SUSPENDED' ? 'Member suspended' : 'Member reactivated');
      } catch (error) {
         toast.error(
            error instanceof Error
               ? error.message
               : `Failed to ${newState === 'SUSPENDED' ? 'suspend' : 'reactivate'} member`
         );
      }
   };

   const handleRemove = async () => {
      if (!membership) return;
      try {
         await removeMember.mutateAsync({
            membershipId: membership.id,
            key: crypto.randomUUID(),
            workspaceId,
         });
         toast.success('Member removed from workspace');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Failed to remove member');
      }
   };

   return (
      <div className="group w-full flex items-center py-2 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm last:border-b-0">
         {/* Clickable Profile navigation area */}
         <Link
            href={`/${orgId}/profiles/${id}`}
            className="flex-1 min-w-0 flex items-center py-0.5 outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
         >
            {/* Name + Avatar */}
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
               <Avatar className="size-8 shrink-0">
                  <AvatarImage src={avatarUrl} alt={displayName || email} />
                  <AvatarFallback className="text-xs font-medium">
                     {((displayName || email || 'M')[0] ?? 'M').toUpperCase()}
                  </AvatarFallback>
               </Avatar>
               <div className="flex flex-col items-start overflow-hidden">
                  <span className="font-medium truncate w-full">
                     {showEmailAsName ? email : displayName}
                  </span>
                  <span className="text-xs text-muted-foreground truncate w-full">
                     {showEmailAsName ? displayName : email || rawName}
                  </span>
               </div>
            </div>

            {/* Status (role) */}
            <div className="w-[110px] shrink-0">
               {isApplication ? (
                  <span className="text-xs text-muted-foreground">Application</span>
               ) : (
                  <span
                     className={cn(
                        'inline-flex items-center text-xs border rounded-md px-1.5 py-0.5',
                        isSuspended
                           ? 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10'
                           : isOwnerOrAdmin
                             ? 'text-indigo-500 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/5'
                             : 'text-muted-foreground border-border/40'
                     )}
                  >
                     {roleLabel}
                  </span>
               )}
            </div>

            {/* Joined */}
            <div className="hidden lg:block w-[100px] shrink-0 text-xs text-muted-foreground">
               {joinedLabel(joinedDate)}
            </div>

            {/* Teams */}
            <div className="hidden md:flex w-[170px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground min-w-0">
               {teamList.length > 0 ? (
                  <>
                     <SquareUser className="size-3.5 shrink-0" />
                     <span className="truncate">
                        {teamList.slice(0, 2).join(', ')}
                        {teamList.length > 2 && ` +${teamList.length - 2}`}
                     </span>
                  </>
               ) : (
                  <span className="text-muted-foreground/40">—</span>
               )}
            </div>

            {/* Last seen */}
            <div className="hidden sm:flex w-[90px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               {user?.status === 'online' && !isApplication && (
                  <>
                     <span className="size-1.5 rounded-full bg-[#00cc66]" />
                     Online
                  </>
               )}
            </div>
         </Link>

         {/* Dropdown column after last seen */}
         <div className="w-8 shrink-0 flex items-center justify-end">
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                     aria-label={`Actions for ${displayName || email || 'member'}`}
                     disabled={isPending}
                  >
                     <MoreHorizontal className="size-4 text-muted-foreground" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48">
                  {/* Update role */}
                  <DropdownMenuSub>
                     <DropdownMenuSubTrigger disabled={isPending || membership?.role === 'OWNER'}>
                        <Shield className="size-4 mr-2" />
                        <span>Update role</span>
                     </DropdownMenuSubTrigger>
                     <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                           value={membership?.role ?? 'MEMBER'}
                           onValueChange={(val) => handleUpdateRole(val as MembershipRole)}
                        >
                           <DropdownMenuRadioItem value="ADMIN">Admin</DropdownMenuRadioItem>
                           <DropdownMenuRadioItem value="MEMBER">Member</DropdownMenuRadioItem>
                           <DropdownMenuRadioItem value="GUEST">Guest</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                     </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* Suspense / Reactivate */}
                  {isSuspended ? (
                     <DropdownMenuItem
                        onClick={() => handleUpdateState('ACTIVE')}
                        disabled={isPending}
                     >
                        <UserCheck className="size-4" />
                        Reactivate
                     </DropdownMenuItem>
                  ) : (
                     <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleUpdateState('SUSPENDED')}
                        disabled={isPending || membership?.role === 'OWNER'}
                     >
                        <UserX className="size-4" />
                        Suspense
                     </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Remove member */}
                  <DropdownMenuItem
                     variant="destructive"
                     onClick={handleRemove}
                     disabled={isPending || membership?.role === 'OWNER'}
                  >
                     <Trash2 className="size-4" />
                     Remove
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
      </div>
   );
}

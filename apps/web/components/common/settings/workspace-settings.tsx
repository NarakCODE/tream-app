'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Users } from 'lucide-react';
import Link from 'next/link';

import { useActiveWorkspace } from '@/features/auth/hooks';
import { useUpdateWorkspace, useLeaveWorkspace } from '@/features/workspaces/hooks';
import { DestructiveConfirmationDialog } from '@/components/common/destructive-confirmation-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

export default function WorkspaceSettings() {
   const router = useRouter();
   const activeWorkspaceQuery = useActiveWorkspace();
   const updateWorkspace = useUpdateWorkspace();
   const leaveWorkspace = useLeaveWorkspace();

   const [name, setName] = useState('');
   const [copiedSlug, setCopiedSlug] = useState(false);
   const [copiedId, setCopiedId] = useState(false);

   const workspace = activeWorkspaceQuery.data?.workspace;
   const membership = activeWorkspaceQuery.data?.membership;
   const isOwner = membership?.role === 'OWNER';

   useEffect(() => {
      if (workspace) {
         setName(workspace.name);
      }
   }, [workspace]);

   const handleCopy = async (text: string, type: 'slug' | 'id') => {
      try {
         await navigator.clipboard.writeText(text);
         if (type === 'slug') {
            setCopiedSlug(true);
            setTimeout(() => setCopiedSlug(false), 2000);
         } else {
            setCopiedId(true);
            setTimeout(() => setCopiedId(false), 2000);
         }
         toast.success('Copied to clipboard');
      } catch {
         toast.error('Failed to copy');
      }
   };

   const handleSaveName = (e: React.FormEvent) => {
      e.preventDefault();
      if (!workspace) return;
      const trimmed = name.trim();
      if (!trimmed) {
         toast.error('Workspace name cannot be empty.');
         return;
      }
      if (trimmed === workspace.name) return;

      updateWorkspace.mutate(
         { id: workspace.id, input: { name: trimmed }, key: crypto.randomUUID() },
         {
            onSuccess: () => {
               toast.success('Workspace name updated.');
            },
            onError: (err) => {
               toast.error(err.message || 'Failed to update workspace name.');
            },
         }
      );
   };

   const handleLeaveWorkspace = async () => {
      if (!workspace) return;
      await leaveWorkspace.mutateAsync(
         { id: workspace.id, key: crypto.randomUUID() },
         {
            onSuccess: () => {
               toast.success('You have left the workspace.');
               router.push('/workspaces');
            },
            onError: (err) => {
               toast.error(err.message || 'Unable to leave workspace. Final owner cannot leave.');
            },
         }
      );
   };

   if (activeWorkspaceQuery.isLoading) {
      return (
         <SettingsShell title="Workspace">
            <p className="text-sm text-muted-foreground">Loading workspace settings…</p>
         </SettingsShell>
      );
   }

   if (activeWorkspaceQuery.isError || !workspace) {
      return (
         <SettingsShell title="Workspace">
            <p role="alert" className="text-sm text-destructive">
               {activeWorkspaceQuery.error?.message ?? 'Unable to load workspace settings.'}
            </p>
         </SettingsShell>
      );
   }

   const initials =
      workspace.name
         .split(/\s+/)
         .map((part) => part[0])
         .join('')
         .slice(0, 2)
         .toUpperCase() || 'W';

   const isDirty = name.trim() !== workspace.name && name.trim().length > 0;

   return (
      <SettingsShell
         title="Workspace"
         description="Manage your workspace details, identity, and membership."
      >
         <SettingsSection title="General">
            <form onSubmit={handleSaveName}>
               <SettingsCard>
                  <SettingsRow
                     title="Workspace icon"
                     description="Your workspace initials badge"
                     trailing={
                        <div className="flex aspect-square size-9 items-center justify-center rounded-md bg-orange-500 text-sm font-semibold text-white">
                           {initials}
                        </div>
                     }
                  />
                  <SettingsRow
                     title="Workspace name"
                     description="The display name of your organization"
                     trailing={
                        <Input
                           aria-label="Workspace name"
                           className="h-8 w-56"
                           value={name}
                           disabled={updateWorkspace.isPending}
                           onChange={(e) => setName(e.target.value)}
                        />
                     }
                  />
                  <SettingsRow
                     title="Workspace URL"
                     description="The public slug identifier for your workspace"
                     trailing={
                        <div className="flex items-center gap-2">
                           <span className="text-sm text-muted-foreground font-mono">
                              /{workspace.slug}
                           </span>
                           <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => handleCopy(workspace.slug, 'slug')}
                           >
                              {copiedSlug ? (
                                 <Check className="size-3.5 text-green-500" />
                              ) : (
                                 <Copy className="size-3.5" />
                              )}
                           </Button>
                        </div>
                     }
                  />
                  <SettingsRow
                     title="Workspace ID"
                     description="Unique database identifier"
                     trailing={
                        <div className="flex items-center gap-2">
                           <span className="text-xs text-muted-foreground font-mono truncate max-w-44">
                              {workspace.id}
                           </span>
                           <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => handleCopy(workspace.id, 'id')}
                           >
                              {copiedId ? (
                                 <Check className="size-3.5 text-green-500" />
                              ) : (
                                 <Copy className="size-3.5" />
                              )}
                           </Button>
                        </div>
                     }
                  />
                  {isDirty && (
                     <div className="flex justify-end border-t border-border px-4 py-3">
                        <Button type="submit" size="sm" disabled={updateWorkspace.isPending}>
                           {updateWorkspace.isPending ? 'Saving…' : 'Save changes'}
                        </Button>
                     </div>
                  )}
               </SettingsCard>
            </form>
         </SettingsSection>

         <SettingsSection title="Access & Members">
            <SettingsCard>
               <SettingsRow
                  title="Your role"
                  description="Your permission level in this workspace"
                  trailing={
                     <Badge variant="secondary" className="font-mono text-xs uppercase">
                        {membership?.role ?? 'MEMBER'}
                     </Badge>
                  }
               />
               <SettingsRow
                  title="Manage members"
                  description="View all members, manage roles, and invite colleagues"
                  trailing={
                     <Button size="sm" variant="outline" asChild>
                        <Link href={`/${workspace.slug}/settings/members`} className="gap-1.5">
                           <Users className="size-3.5" />
                           <span>View members</span>
                           <ExternalLink className="size-3 ml-0.5" />
                        </Link>
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Danger zone">
            <SettingsCard className="border-destructive/30">
               <SettingsRow
                  title="Leave workspace"
                  description="Revoke your membership and access to this workspace"
                  trailing={
                     <DestructiveConfirmationDialog
                        trigger={
                           <Button
                              size="sm"
                              variant="destructive"
                              disabled={leaveWorkspace.isPending}
                           >
                              Leave workspace
                           </Button>
                        }
                        title="Leave workspace?"
                        description={
                           <>
                              Are you sure you want to leave &quot;{workspace.name}&quot;? You will
                              lose access to all issues, projects, and documents in this workspace.
                           </>
                        }
                        notice={
                           isOwner && (
                              <Alert variant="destructive">
                                 <AlertTitle>Last active owner</AlertTitle>
                                 <AlertDescription>
                                    If you are the last active owner, you must assign another owner
                                    before leaving.
                                 </AlertDescription>
                              </Alert>
                           )
                        }
                        confirmLabel="Leave"
                        pendingLabel="Leaving…"
                        onConfirm={handleLeaveWorkspace}
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { createWorkspaceInputSchema } from '@repo/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/features/auth/hooks';
import { authKeys } from '@/features/auth/queries';
import { bootstrapKeys, bootstrapQueryOptions, seedBootstrap } from '@/features/bootstrap/queries';
import { api } from '@/lib/api';
import { useCreateWorkspace } from './hooks';
import { workspaceKeys } from './queries';
import { onboardingAttempt, readOnboardingDraft } from '@/features/onboarding/storage';

function errorMessage(error: unknown) {
   if (error instanceof ApiError && error.status === 409)
      return 'This workspace slug is already in use. Choose another slug and try again.';
   return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function WorkspaceSetup({
   embedded = false,
   onComplete,
}: {
   embedded?: boolean;
   onComplete?: () => void;
}) {
   const router = useRouter();
   const queryClient = useQueryClient();
   const user = useCurrentUser();
   const create = useCreateWorkspace();
   const [name, setName] = useState('');
   const [slug, setSlug] = useState('');
   const [slugEdited, setSlugEdited] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [completionPending, setCompletionPending] = useState(false);
   const [reading, setReading] = useState(false);
   const busy = create.isPending || reading;
   const scope = `workspace:${user.data?.id}`;

   useEffect(() => {
      if (!user.data?.id) return;
      const draft = readOnboardingDraft(scope, createWorkspaceInputSchema);
      if (draft) {
         setName(draft.name);
         setSlug(draft.slug);
         setSlugEdited(true);
      }
   }, [scope, user.data?.id]);

   async function complete() {
      setReading(true);
      setError(null);
      setCompletionPending(true);
      try {
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.all, refetchType: 'none' }),
            queryClient.invalidateQueries({
               queryKey: authKeys.activeWorkspace(),
               refetchType: 'none',
            }),
         ]);
         await queryClient.invalidateQueries({ queryKey: bootstrapKeys.all, refetchType: 'none' });
         const bootstrap = await queryClient.fetchQuery(bootstrapQueryOptions(api));
         seedBootstrap(queryClient, bootstrap);
         const active = bootstrap.activeWorkspace;
         if (!active)
            throw new Error('Your workspace could not be loaded. Retry to finish opening it.');
         try {
            localStorage.removeItem(`tream:onboarding:attempt:${scope}`);
         } catch {
            // Confirmed server state allows setup to continue even if draft cleanup fails.
         }
         if (onComplete) {
            onComplete();
            return;
         }
         router.replace('/onboarding');
         router.refresh();
      } catch (cause) {
         setError(errorMessage(cause));
      } finally {
         setReading(false);
      }
   }

   async function createWorkspace(event: FormEvent) {
      event.preventDefault();
      setError(null);
      const result = createWorkspaceInputSchema.safeParse({ name, slug });
      if (!result.success) {
         setError(result.error.issues[0]?.message ?? 'Check your workspace name and slug.');
         return;
      }
      try {
         const key = onboardingAttempt(scope, result.data);
         await create.mutateAsync({ input: result.data, key });
         await complete();
      } catch (cause) {
         setError(errorMessage(cause));
      }
   }

   return (
      <div
         className={
            embedded
               ? 'space-y-6'
               : 'mx-auto flex min-h-svh w-full max-w-[528px] flex-col justify-center gap-6 px-6 py-12'
         }
      >
         <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
               Create a workspace
            </h1>
            <p className="text-sm text-muted-foreground">A shared home for your team’s work.</p>
         </div>

         {error && (
            <div
               role="alert"
               className="rounded-md border border-destructive/20 p-3 text-sm text-destructive"
            >
               <p className="font-medium">{error}</p>
               {completionPending && (
                  <Button
                     className="mt-3"
                     variant="outline"
                     disabled={busy}
                     onClick={() => void complete()}
                  >
                     Retry opening workspace
                  </Button>
               )}
            </div>
         )}

         <form onSubmit={createWorkspace} className="space-y-5">
            <div className="space-y-2">
               <Label htmlFor="workspace-name">Workspace name</Label>
               <Input
                  id="workspace-name"
                  placeholder="Acme"
                  value={name}
                  disabled={busy || completionPending}
                  onChange={(event) => {
                     setName(event.target.value);
                     if (!slugEdited)
                        setSlug(
                           event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/^-|-$/g, '')
                        );
                  }}
                  autoComplete="organization"
                  required
               />
            </div>
            <div className="space-y-2">
               <Label htmlFor="workspace-slug">Workspace URL</Label>
               <Input
                  id="workspace-slug"
                  placeholder="acme"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={slug}
                  disabled={busy || completionPending}
                  onChange={(event) => {
                     setSlugEdited(true);
                     setSlug(event.target.value);
                  }}
                  aria-describedby="workspace-slug-help"
                  required
               />
               <p id="workspace-slug-help" className="text-xs text-muted-foreground">
                  Use lowercase letters, numbers, and hyphens.
               </p>
            </div>
            <Button type="submit" disabled={busy || completionPending} className="w-full">
               {create.isPending ? 'Creating…' : 'Create workspace'}
            </Button>
         </form>
      </div>
   );
}

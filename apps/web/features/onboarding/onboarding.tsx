'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { hasPermission, type Team } from '@repo/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveWorkspace, useCurrentUser } from '@/features/auth/hooks';
import { WorkspaceSetup } from '@/features/workspaces/workspace-setup';
import { useCreateTeam, useTeamList } from '@/features/teams/hooks';
import { teamCreationInputSchema as teamInputSchema } from '@/features/teams/api';
import { InvitationStep } from '@/features/invitations/invitation-step';
import { onboardingAttempt, readOnboardingDraft } from './storage';

const progressSchema = z.object({ teamId: z.string(), complete: z.boolean() });
const steps = ['Account', 'Workspace', 'First team', 'Optional invitations', 'Team issues'];

function message(error: unknown) {
   return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function Onboarding() {
   const router = useRouter();
   const user = useCurrentUser();
   const active = useActiveWorkspace();
   const workspace = active.data?.workspace;
   const list = useTeamList(workspace?.id ?? '');
   const create = useCreateTeam(workspace?.id ?? '');
   const [name, setName] = useState('');
   const [key, setKey] = useState('');
   const [keyEdited, setKeyEdited] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [progress, setProgress] = useState<z.infer<typeof progressSchema> | null>(null);
   const [createdTeam, setCreatedTeam] = useState<Pick<Team, 'id' | 'name' | 'workspaceId'> | null>(
      null
   );
   const [loadedScope, setLoadedScope] = useState('');
   const scope = `${user.data?.id}:${workspace?.id}`;
   const teams = list.data?.pages.flatMap((page) => page.data) ?? [];
   const team =
      teams.find((item) => item.id === progress?.teamId) ??
      (createdTeam?.workspaceId === workspace?.id ? createdTeam : null) ??
      teams[0];
   const step = !workspace ? 0 : !team ? 1 : 2;
   const teamScope = `team:${scope}`;
   const busy = create.isPending;

   useEffect(() => {
      if (!user.data?.id || !workspace?.id) return;
      let saved: z.infer<typeof progressSchema> | null = null;
      try {
         const raw = localStorage.getItem(`tream:onboarding:progress:${scope}`);
         const parsed = progressSchema.safeParse(raw ? JSON.parse(raw) : null);
         if (parsed.success) saved = parsed.data;
      } catch {
         // Server state still determines which setup steps are complete.
      }
      setProgress(saved);
      setCreatedTeam(null);
      const draft = readOnboardingDraft(teamScope, teamInputSchema);
      setName(draft?.name ?? '');
      setKey(draft?.key ?? '');
      setKeyEdited(Boolean(draft));
      setLoadedScope(scope);
   }, [scope, teamScope, user.data?.id, workspace?.id]);

   useEffect(() => {
      if (loadedScope === scope && progress?.complete && team && workspace) {
         router.replace(`/${encodeURIComponent(workspace.slug)}`);
      }
   }, [loadedScope, scope, progress?.complete, team, workspace, router]);

   async function createTeam(event: FormEvent) {
      event.preventDefault();
      if (busy || !workspace || !user.data) return;
      setError(null);
      const parsed = teamInputSchema.safeParse({ name, key, visibility: 'WORKSPACE' });
      if (!parsed.success) {
         setError(parsed.error.issues[0]?.message ?? 'Check your team details.');
         return;
      }
      try {
         const commandKey = onboardingAttempt(teamScope, parsed.data);
         const created = await create.mutateAsync({ input: parsed.data, key: commandKey });
         setCreatedTeam(created);
         const next = { teamId: created.id, complete: false };
         setProgress(next);
         try {
            localStorage.setItem(`tream:onboarding:progress:${scope}`, JSON.stringify(next));
         } catch {
            // The created team remains discoverable through the API on reload.
         }
      } catch (cause) {
         setError(message(cause));
      }
   }

   function finish() {
      if (!team || !workspace) return;
      const next = { teamId: team.id, complete: true };
      try {
         localStorage.setItem(`tream:onboarding:progress:${scope}`, JSON.stringify(next));
      } catch {
         // Completion does not require browser storage; resources are persisted by the API.
      }
      setProgress(next);
      router.replace(`/${encodeURIComponent(workspace.slug)}`);
      router.refresh();
   }

   if (
      user.isPending ||
      active.isPending ||
      (workspace && (list.isPending || loadedScope !== scope))
   ) {
      return (
         <main className="grid min-h-svh place-items-center p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
               <div
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent motion-reduce:animate-none"
               />
               <span role="status">Loading your setup…</span>
            </div>
         </main>
      );
   }
   const failure = user.error ?? active.error ?? list.error;
   if (failure) {
      return (
         <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
            <h1 className="text-xl font-semibold text-foreground">We couldn’t load your setup</h1>
            <p role="alert" className="text-sm text-destructive">
               {message(failure)}
            </p>
            <Button onClick={() => window.location.reload()} className="w-fit">
               Retry
            </Button>
         </main>
      );
   }

   return (
      <main className="mx-auto flex min-h-svh w-full max-w-[528px] flex-col justify-center gap-9 px-6 py-10 sm:py-16">
         <header className="space-y-7">
            <Link
               href="/"
               className="w-fit rounded-sm text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
               Circle
            </Link>
            <nav aria-label="Onboarding progress">
               <ol className="flex flex-wrap gap-x-4 gap-y-3">
                  {steps.map((label, index) => {
                     const complete = index < step + 1;
                     const current = index === step + 1;
                     return (
                        <li
                           key={label}
                           aria-current={current ? 'step' : undefined}
                           className={`flex items-center gap-1.5 text-xs ${
                              current ? 'font-medium text-foreground' : 'text-muted-foreground'
                           }`}
                        >
                           <span
                              aria-hidden="true"
                              className="flex size-4 shrink-0 items-center justify-center"
                           >
                              {complete ? <Check className="size-3" /> : index + 1}
                           </span>
                           <span>{label}</span>
                           {complete && <span className="sr-only">Completed</span>}
                        </li>
                     );
                  })}
               </ol>
            </nav>
         </header>

         {error && (
            <div
               role="alert"
               className="rounded-md border border-destructive/20 p-3 text-sm text-destructive"
            >
               {error}
            </div>
         )}

         {step === 0 && <WorkspaceSetup embedded onComplete={() => setError(null)} />}

         {step === 1 && (
            <div className="space-y-6">
               <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                     Create your first team
                  </h1>
                  <p className="text-sm text-muted-foreground">
                     Organize your issues in {workspace?.name}.
                  </p>
               </div>

               {hasPermission(active.data?.membership.role ?? null, 'team.manage') ? (
                  <form onSubmit={createTeam} className="space-y-5">
                     <div className="space-y-2">
                        <Label htmlFor="first-team-name">Team name</Label>
                        <Input
                           id="first-team-name"
                           placeholder="Engineering"
                           value={name}
                           maxLength={100}
                           required
                           disabled={busy}
                           onChange={(event) => {
                              setName(event.target.value);
                              if (!keyEdited)
                                 setKey(
                                    event.target.value
                                       .toUpperCase()
                                       .replace(/[^A-Z0-9]/g, '')
                                       .slice(0, 3)
                                 );
                           }}
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="first-team-key">Issue prefix</Label>
                        <Input
                           id="first-team-key"
                           placeholder="ENG"
                           value={key}
                           required
                           minLength={2}
                           maxLength={10}
                           aria-describedby="team-key-help"
                           disabled={busy}
                           onChange={(event) => {
                              setKeyEdited(true);
                              setKey(event.target.value.toUpperCase());
                           }}
                        />
                        <p id="team-key-help" className="text-xs text-muted-foreground">
                           2–10 letters or numbers, starting with a letter. Your issues will look
                           like {key || 'ENG'}-1.
                        </p>
                     </div>
                     <Button type="submit" disabled={busy} className="w-full">
                        {busy ? 'Creating team…' : 'Create team'}
                        <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                     </Button>
                  </form>
               ) : (
                  <p className="text-sm text-muted-foreground">
                     Your workspace administrator needs to create a team. You can return here once
                     it’s ready.
                  </p>
               )}
            </div>
         )}

         {step === 2 && workspace && team && (
            <div className="space-y-6">
               <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                     Invite teammates
                  </h1>
                  <p className="text-sm text-muted-foreground">
                     {team.name} is ready. Invite people now, or do this later.
                  </p>
               </div>

               {hasPermission(active.data?.membership.role ?? null, 'membership.invite') ? (
                  <InvitationStep workspaceId={workspace.id} onContinue={finish} />
               ) : (
                  <Button onClick={finish} className="w-full">
                     Open workspace
                     <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                  </Button>
               )}
            </div>
         )}
      </main>
   );
}

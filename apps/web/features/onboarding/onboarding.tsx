'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { hasPermission } from '@repo/schemas';
import { ApiError } from '@repo/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBootstrap, useCompleteOnboarding } from '@/features/bootstrap/hooks';
import { verificationDestination } from '@/features/auth/redirect';
import { useSelectWorkspace, useWorkspaceList } from '@/features/workspaces/hooks';
import { WorkspaceSetup } from '@/features/workspaces/workspace-setup';
import { useCreateTeam } from '@/features/teams/hooks';
import { teamCreationInputSchema as teamInputSchema } from '@/features/teams/api';
import { InvitationStep } from '@/features/invitations/invitation-step';
import { onboardingAttempt, readOnboardingDraft } from './storage';

const steps = ['Account', 'Workspace', 'First team', 'Optional invitations', 'My Issues'];

function message(error: unknown) {
   return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function Onboarding() {
   const router = useRouter();
   const bootstrap = useBootstrap();
   const user = bootstrap.data?.user;
   const active = bootstrap.data?.activeWorkspace;
   const workspace = active?.workspace;
   const nextStep = bootstrap.data?.onboarding.nextStep;
   const create = useCreateTeam(workspace?.id ?? '');
   const complete = useCompleteOnboarding(workspace?.id ?? '');
   const select = useSelectWorkspace();
   const [name, setName] = useState('');
   const [key, setKey] = useState('');
   const [keyEdited, setKeyEdited] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const completionKey = useRef<{ scope: string; key: string } | null>(null);
   const finishing = useRef(false);
   const scope = `${user?.id}:${workspace?.id}`;
   const teamScope = `team:${scope}`;
   const step =
      nextStep === 'CREATE_WORKSPACE' || nextStep === 'SELECT_WORKSPACE'
         ? 0
         : nextStep === 'CREATE_TEAM' || nextStep === 'WAIT_FOR_TEAM'
           ? 1
           : 2;
   const busy = create.isPending || complete.isPending || select.isPending;

   useEffect(() => {
      if (!user?.id || !workspace?.id) return;
      const draft = readOnboardingDraft(teamScope, teamInputSchema);
      setName(draft?.name ?? '');
      setKey(draft?.key ?? '');
      setKeyEdited(Boolean(draft));
   }, [teamScope, user?.id, workspace?.id]);

   useEffect(() => {
      if (nextStep === 'VERIFY_EMAIL') router.replace(verificationDestination('/onboarding'));
      if (nextStep === 'DONE' && workspace)
         router.replace(`/${encodeURIComponent(workspace.slug)}/my-issues`);
   }, [nextStep, workspace, router]);

   async function createTeam(event: FormEvent) {
      event.preventDefault();
      if (busy || !workspace || !user) return;
      setError(null);
      const parsed = teamInputSchema.safeParse({ name, key, visibility: 'WORKSPACE' });
      if (!parsed.success) {
         setError(parsed.error.issues[0]?.message ?? 'Check your team details.');
         return;
      }
      try {
         const commandKey = onboardingAttempt(teamScope, parsed.data);
         await create.mutateAsync({ input: parsed.data, key: commandKey });
         await bootstrap.refetch({ throwOnError: true });
      } catch (cause) {
         setError(message(cause));
      }
   }

   async function finish() {
      if (!workspace || busy || finishing.current) return;
      finishing.current = true;
      setError(null);
      if (completionKey.current?.scope !== scope)
         completionKey.current = { scope, key: crypto.randomUUID() };
      try {
         const result = await complete.mutateAsync(completionKey.current.key);
         if (
            result.onboarding.nextStep !== 'DONE' ||
            result.activeWorkspace?.workspaceId !== workspace.id
         )
            throw new Error('Your setup changed. Review the remaining steps before continuing.');
         router.replace(`/${encodeURIComponent(result.activeWorkspace.workspace.slug)}/my-issues`);
         router.refresh();
      } catch (cause) {
         setError(message(cause));
         if (cause instanceof ApiError && (cause.status === 409 || cause.status === 403))
            await bootstrap.refetch();
      } finally {
         finishing.current = false;
      }
   }

   if (bootstrap.isPending || nextStep === 'DONE' || nextStep === 'VERIFY_EMAIL') {
      return (
         <main className="grid min-h-svh place-items-center p-6">
            <p role="status">Loading your setup…</p>
         </main>
      );
   }
   const failure = bootstrap.error;
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

         {nextStep === 'CREATE_WORKSPACE' && (
            <WorkspaceSetup embedded onComplete={() => setError(null)} />
         )}
         {nextStep === 'SELECT_WORKSPACE' && (
            <WorkspaceSelection
               onSelect={async (id) => {
                  setError(null);
                  try {
                     await select.mutateAsync({ id, key: crypto.randomUUID() });
                  } catch (cause) {
                     setError(message(cause));
                  }
               }}
               busy={busy}
            />
         )}

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

               {nextStep === 'CREATE_TEAM' ? (
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
                  <div className="text-sm text-muted-foreground">
                     Your workspace administrator needs to create a team. You can return here once
                     it’s ready.
                     <Button
                        variant="outline"
                        className="mt-4 block"
                        disabled={bootstrap.isFetching}
                        onClick={() => void bootstrap.refetch()}
                     >
                        Check again
                     </Button>
                  </div>
               )}
            </div>
         )}

         {step === 2 && workspace && (
            <div className="space-y-6">
               <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                     Invite teammates
                  </h1>
                  <p className="text-sm text-muted-foreground">
                     {workspace.name} is ready. Invite people now, or do this later.
                  </p>
               </div>

               {hasPermission(active?.membership.role ?? null, 'membership.invite') ? (
                  <InvitationStep
                     workspaceId={workspace.id}
                     onContinue={() => void finish()}
                     completing={complete.isPending}
                  />
               ) : (
                  <Button onClick={() => void finish()} disabled={busy} className="w-full">
                     Open workspace
                     <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                  </Button>
               )}
            </div>
         )}
      </main>
   );
}

function WorkspaceSelection({
   onSelect,
   busy,
}: {
   onSelect: (id: string) => Promise<void>;
   busy: boolean;
}) {
   const list = useWorkspaceList();
   if (list.isPending) return <p role="status">Loading workspaces…</p>;
   if (list.isError)
      return (
         <div>
            <p role="alert">{message(list.error)}</p>
            <Button onClick={() => void list.refetch()}>Retry</Button>
         </div>
      );
   return (
      <div className="space-y-4">
         <h1 className="text-2xl font-semibold">Choose a workspace</h1>
         {list.data.pages
            .flatMap((page) => page.data)
            .map((workspace) => (
               <Button
                  key={workspace.id}
                  variant="outline"
                  disabled={busy}
                  className="w-full"
                  onClick={() => void onSelect(workspace.id)}
               >
                  {workspace.name}
               </Button>
            ))}
         {list.hasNextPage && (
            <Button
               variant="ghost"
               disabled={list.isFetchingNextPage}
               onClick={() => void list.fetchNextPage()}
            >
               Load more
            </Button>
         )}
      </div>
   );
}

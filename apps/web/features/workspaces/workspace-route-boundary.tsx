'use client';

import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useActiveWorkspace } from '@/features/auth/hooks';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { api } from '@/lib/api';
import { useSelectWorkspace } from './hooks';

// Deduplicate Strict Mode remounts and serialize switches to prevent late commands
// from selecting an earlier route after a newer route's command completes.
const switches = new WeakMap<QueryClient, Map<string, { key: string; promise?: Promise<void> }>>();
const queues = new WeakMap<QueryClient, Promise<void>>();
const pendingSwitches = new WeakMap<QueryClient, Set<Promise<void>>>();

export function WorkspaceRouteBoundary({
   workspaceId,
   userId,
   children,
}: {
   workspaceId: string;
   userId: string;
   children: React.ReactNode;
}) {
   const client = useQueryClient();
   const active = useActiveWorkspace();
   const { mutateAsync: select } = useSelectWorkspace();
   const [attempt, setAttempt] = useState(0);
   const [error, setError] = useState<string | null>(null);
   const [ready, setReady] = useState(
      active.data?.workspaceId === workspaceId && !pendingSwitches.get(client)?.size
   );

   useEffect(() => {
      let cancelled = false;
      if (
         client.getQueryData(activeWorkspaceQueryOptions(api).queryKey)?.workspaceId ===
            workspaceId &&
         !pendingSwitches.get(client)?.size
      ) {
         setReady(true);
         return;
      }
      setReady(false);
      setError(null);
      const scope = `${userId}:${workspaceId}`;
      let entries = switches.get(client);
      if (!entries) {
         entries = new Map();
         switches.set(client, entries);
      }
      const registry = entries;
      let found = registry.get(scope);
      if (!found) {
         found = { key: crypto.randomUUID() };
         registry.set(scope, found);
      }
      const entry = found;
      if (!entry.promise) {
         const previous = queues.get(client) ?? Promise.resolve();
         entry.promise = previous
            .catch(() => undefined)
            .then(async () => {
               if (client.getQueryData(currentUserQueryOptions(api).queryKey)?.id !== userId) {
                  throw new Error('Your session changed. Reload the page to continue.');
               }
               await select({ id: workspaceId, key: entry.key });
            });
         queues.set(client, entry.promise);
         let pending = pendingSwitches.get(client);
         if (!pending) {
            pending = new Set();
            pendingSwitches.set(client, pending);
         }
         const flight = entry.promise;
         pending.add(flight);
         void flight.then(
            () => pending.delete(flight),
            () => pending.delete(flight)
         );
      }
      const command = entry.promise;
      void command
         .then(async () => {
            if (
               cancelled ||
               client.getQueryData(currentUserQueryOptions(api).queryKey)?.id !== userId
            )
               return;
            const selected = await client.fetchQuery(activeWorkspaceQueryOptions(api));
            if (cancelled) return;
            if (selected?.workspaceId !== workspaceId)
               throw new Error('The workspace could not be selected.');
            registry.delete(scope);
            setReady(true);
         })
         .catch((failure: unknown) => {
            if (entry.promise === command) entry.promise = undefined;
            if (!cancelled)
               setError(failure instanceof Error ? failure.message : 'Unable to switch workspace.');
         });
      return () => {
         cancelled = true;
      };
   }, [workspaceId, userId, client, select, attempt]);

   if (!ready || active.data?.workspaceId !== workspaceId) {
      return (
         <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
            {error ? (
               <>
                  <p role="alert" className="text-sm text-muted-foreground">
                     {error}
                  </p>
                  <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                     Retry workspace selection
                  </Button>
               </>
            ) : (
               <p role="status" className="text-sm text-muted-foreground">
                  Opening workspace…
               </p>
            )}
         </div>
      );
   }
   return children;
}

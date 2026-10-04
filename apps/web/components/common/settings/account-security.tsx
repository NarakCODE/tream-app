'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { KeyRound, Laptop } from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentSessionId } from '@/lib/api';
import {
   useAuthSessions,
   useLogoutAllMutation,
   useLogoutMutation,
   useRevokeSessionMutation,
} from '@/features/auth/hooks';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal security settings connected to the authentication session API. */
export default function AccountSecurity() {
   const sessions = useAuthSessions();
   const revokeAll = useLogoutAllMutation();
   const logout = useLogoutMutation();
   const revokeSession = useRevokeSessionMutation();
   const [isMounted, setIsMounted] = React.useState(false);

   React.useEffect(() => {
      setIsMounted(true);
   }, []);
   const currentSessionId = isMounted ? getCurrentSessionId() : null;

   return (
      <SettingsShell title="Security & access">
         <SettingsSection title="Sessions" description="Devices logged into your account">
            {sessions.isLoading && (
               <SettingsCard>
                  <SettingsRow title="Loading sessions…" />
               </SettingsCard>
            )}
            {sessions.isError && (
               <SettingsCard>
                  <SettingsRow
                     title="Unable to load sessions"
                     description={sessions.error.message}
                  />
               </SettingsCard>
            )}
            {sessions.data?.length === 0 && (
               <SettingsCard>
                  <SettingsRow title="No active sessions" />
               </SettingsCard>
            )}
            {sessions.data?.map((session) => {
               const isCurrent = session.id === currentSessionId;
               const expiration = new Date(session.expiresAt).toISOString();
               return (
                  <SettingsCard key={session.id}>
                     <SettingsRow
                        icon={<Laptop className="size-4" />}
                        title={isCurrent ? 'Current session' : `Session ${session.id.slice(0, 8)}`}
                        description={`Expires ${expiration}`}
                        trailing={
                           isCurrent ? (
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 disabled={logout.isPending}
                                 onClick={() =>
                                    logout.mutate(undefined, {
                                       onError: (error) => toast.error(error.message),
                                    })
                                 }
                              >
                                 Sign out
                              </Button>
                           ) : (
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 disabled={revokeSession.isPending}
                                 onClick={() =>
                                    revokeSession.mutate(session.id, {
                                       onSuccess: () => toast.success('Session revoked.'),
                                       onError: (error) => toast.error(error.message),
                                    })
                                 }
                              >
                                 Revoke
                              </Button>
                           )
                        }
                     />
                  </SettingsCard>
               );
            })}
            {!!sessions.data?.length && (
               <SettingsCard>
                  <SettingsRow
                     title="Sign out all sessions"
                     description="This signs you out on every device."
                     trailing={
                        <Button
                           size="xs"
                           variant="ghost"
                           disabled={revokeAll.isPending}
                           onClick={() =>
                              revokeAll.mutate(undefined, {
                                 onError: (error) => toast.error(error.message),
                              })
                           }
                        >
                           {revokeAll.isPending ? 'Signing out…' : 'Sign out all'}
                        </Button>
                     }
                  />
               </SettingsCard>
            )}
         </SettingsSection>

         <SettingsSection
            title="Passkeys"
            description="Passkeys are a secure way to sign in to your account"
         >
            <SettingsCard>
               <SettingsRow
                  title="No passkeys registered"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        New passkey
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal API keys"
            description="Use the API to build your own integrations"
         >
            <SettingsCard>
               <SettingsRow
                  title="No personal API keys"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        New API key
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Commit signing key"
            description="Coding sessions use this key to sign your commits"
         >
            <SettingsCard>
               <SettingsRow
                  icon={<KeyRound className="size-4" />}
                  title="No signing key added"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        Add key
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}

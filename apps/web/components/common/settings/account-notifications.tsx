'use client';

import { Switch } from '@/components/ui/switch';
import { Inbox, Mail, Monitor, Slack, Smartphone } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useActiveWorkspace, useCurrentUser } from '@/features/auth/hooks';
import {
   useNotificationPreferences,
   useUpdateNotificationPreferences,
} from '@/features/notifications/hooks';
import { EnabledDot, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const CLIENT_CHANNELS = [
   {
      icon: <Monitor className="size-4" />,
      title: 'Desktop push',
      status: 'Device alerts for active browser sessions',
   },
   {
      icon: <Smartphone className="size-4" />,
      title: 'Mobile push',
      status: 'Push alerts for mobile devices',
   },
   { icon: <Slack className="size-4" />, title: 'Slack integration', status: 'Requires workspace Slack app' },
];

/** Personal notification settings (workspace channels + client push + product updates). */
export default function AccountNotifications() {
   const active = useActiveWorkspace();
   const user = useCurrentUser();
   const workspaceId = active.data?.workspaceId ?? '';
   const userId = user.data?.id ?? '';

   const preferences = useNotificationPreferences(workspaceId, userId);
   const updatePreferences = useUpdateNotificationPreferences(workspaceId, userId);

   return (
      <SettingsShell title="Notifications">
         <SettingsSection
            title="Workspace notification channels"
            description="Manage your active notification channels for this workspace. These preferences sync with your backend notification inbox and email delivery workers."
         >
            <SettingsCard>
               {preferences.isPending ? (
                  <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                     <Spinner className="size-4" />
                     <span>Loading notification preferences…</span>
                  </div>
               ) : preferences.isError ? (
                  <div className="p-4 text-xs text-muted-foreground">
                     <span>Unable to load preferences from server.</span>
                  </div>
               ) : (
                  <>
                     <SettingsRow
                        icon={<Inbox className="size-4" />}
                        title="In-app notifications"
                        description={
                           <EnabledDot>
                              {preferences.data?.inAppEnabled
                                 ? 'Enabled — Notifications appear in your workspace inbox'
                                 : 'Disabled — In-app inbox is paused'}
                           </EnabledDot>
                        }
                        trailing={
                           <div className="flex items-center gap-2">
                              {updatePreferences.isPending && <Spinner className="size-3.5" />}
                              <Switch
                                 checked={preferences.data?.inAppEnabled ?? true}
                                 disabled={updatePreferences.isPending}
                                 onCheckedChange={(inAppEnabled) =>
                                    preferences.data &&
                                    updatePreferences.mutate({
                                       preferences: preferences.data,
                                       patch: { inAppEnabled },
                                    })
                                 }
                              />
                           </div>
                        }
                     />
                     <SettingsRow
                        icon={<Mail className="size-4" />}
                        title="Email notifications"
                        description={
                           <EnabledDot>
                              {preferences.data?.emailEnabled
                                 ? 'Enabled — Delivery worker dispatches emails for mentions and assignments'
                                 : 'Disabled — Email delivery jobs are suppressed'}
                           </EnabledDot>
                        }
                        trailing={
                           <div className="flex items-center gap-2">
                              {updatePreferences.isPending && <Spinner className="size-3.5" />}
                              <Switch
                                 checked={preferences.data?.emailEnabled ?? false}
                                 disabled={updatePreferences.isPending}
                                 onCheckedChange={(emailEnabled) =>
                                    preferences.data &&
                                    updatePreferences.mutate({
                                       preferences: preferences.data,
                                       patch: { emailEnabled },
                                    })
                                 }
                              />
                           </div>
                        }
                     />
                  </>
               )}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Device & client notifications"
            description="Choose which notifications are pushed to your devices. All notifications will still respect your workspace channel settings."
         >
            <SettingsCard>
               {CLIENT_CHANNELS.map((channel) => (
                  <SettingsRow
                     key={channel.title}
                     icon={channel.icon}
                     title={channel.title}
                     description={<EnabledDot>{channel.status}</EnabledDot>}
                     chevron
                     onClick={() => {}}
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Updates from LNDev UI"
            description="Subscribe to product announcements and important changes from the LNDev UI team"
         >
            <h3 className="text-sm font-medium mt-2">Changelog</h3>
            <SettingsCard>
               <SettingsRow
                  title="Show updates in sidebar"
                  description="Highlight new features and improvements in the app sidebar"
                  trailing={<Switch defaultChecked />}
               />
               <SettingsRow
                  title="Changelog newsletter"
                  description="Receive an email twice a month highlighting new features and improvements"
                  trailing={<Switch />}
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Marketing</h3>
            <SettingsCard>
               <SettingsRow
                  title="Marketing and onboarding"
                  description="Occasional updates to help you get the most out of LNDev UI"
                  trailing={<Switch />}
               />
            </SettingsCard>

            <h3 className="text-sm font-medium mt-2">Other updates</h3>
            <SettingsCard>
               <SettingsRow
                  title="Invite accepted"
                  description="Receive an email when an invite you sent is accepted"
                  trailing={<Switch defaultChecked />}
               />
               <SettingsRow
                  title="Privacy and legal updates"
                  description="Important updates about terms of service or privacy policy changes"
                  trailing={<Switch defaultChecked />}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}

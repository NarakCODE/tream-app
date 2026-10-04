'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { profileInputSchema, type ProfileInput, type AuthUser } from '@repo/schemas';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser, useUpdateProfileMutation } from '@/features/auth/hooks';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

interface ProfileFormProps {
   user: AuthUser;
}

function ProfileForm({ user }: ProfileFormProps) {
   const updateProfile = useUpdateProfileMutation();
   const {
      register,
      handleSubmit,
      reset,
      formState: { errors, isDirty },
   } = useForm<ProfileInput>({
      resolver: zodResolver(profileInputSchema),
      defaultValues: {
         fullName: user.fullName,
      },
   });

   React.useEffect(() => {
      reset({ fullName: user.fullName });
   }, [user.fullName, reset]);

   const onSubmit = (input: ProfileInput) => {
      if (updateProfile.isPending) return;
      updateProfile.mutate(input, {
         onSuccess: (updatedUser) => {
            reset({ fullName: updatedUser.fullName });
            toast.success('Profile updated.');
         },
         onError: (error) => {
            toast.error(error.message || 'Unable to update your profile.');
         },
      });
   };

   return (
      <SettingsSection>
         <form onSubmit={handleSubmit(onSubmit)}>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  trailing={
                     <Avatar className="size-9">
                        <AvatarImage src={user.avatarUrl ?? undefined} alt={user.fullName} />
                        <AvatarFallback>{user.fullName.trim().slice(0, 1) || 'U'}</AvatarFallback>
                     </Avatar>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={<span className="text-foreground">{user.email}</span>}
               />
               <SettingsRow
                  title="Full name"
                  trailing={
                     <Input
                        autoComplete="name"
                        aria-label="Full name"
                        aria-invalid={Boolean(errors.fullName)}
                        className="h-8 w-44"
                        disabled={updateProfile.isPending}
                        {...register('fullName')}
                     />
                  }
               />
               {errors.fullName && (
                  <p role="alert" className="px-4 pb-3 text-xs text-destructive">
                     {errors.fullName.message}
                  </p>
               )}
               <div className="flex justify-end border-t border-border px-4 py-3">
                  <Button type="submit" size="sm" disabled={!isDirty || updateProfile.isPending}>
                     {updateProfile.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
               </div>
            </SettingsCard>
         </form>
      </SettingsSection>
   );
}

/** Personal profile fields backed by the authenticated user's profile API. */
export default function Profile() {
   const userQuery = useCurrentUser();

   if (userQuery.isLoading) {
      return (
         <SettingsShell title="Profile">
            <p className="text-sm text-muted-foreground">Loading profile…</p>
         </SettingsShell>
      );
   }

   if (userQuery.isError || !userQuery.data) {
      return (
         <SettingsShell title="Profile">
            <p role="alert" className="text-sm text-destructive">
               {userQuery.error?.message ?? 'Unable to load your profile.'}
            </p>
         </SettingsShell>
      );
   }

   return (
      <SettingsShell title="Profile">
         <ProfileForm user={userQuery.data} />
      </SettingsShell>
   );
}

import { redirect } from 'next/navigation';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { createServerApiClient } from '@/lib/server-api';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import { teamListQueryOptions } from '@/features/teams/queries';
import { hasPermission } from '@repo/schemas';

export default async function Home() {
   let workspace;
   let needsTeam = false;
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 10_000);
   try {
      const api = await createServerApiClient(controller.signal);
      const client = getQueryClient();
      const user = await client.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination('/'));
      workspace = await client.fetchQuery(activeWorkspaceQueryOptions(api));
      if (workspace && hasPermission(workspace.membership.role, 'team.manage')) {
         const teams = await client.fetchInfiniteQuery(
            teamListQueryOptions(api, workspace.workspaceId)
         );
         needsTeam = teams.pages[0]?.data.length === 0;
      }
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      throw error;
   } finally {
      clearTimeout(timer);
   }
   if (!workspace || needsTeam) redirect('/onboarding');
   redirect(`/${encodeURIComponent(workspace.workspace.slug)}/my-issues`);
}

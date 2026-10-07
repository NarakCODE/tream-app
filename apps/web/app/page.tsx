import { redirect } from 'next/navigation';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { createServerApiClient } from '@/lib/server-api';
import { bootstrapQueryOptions } from '@/features/bootstrap/queries';
import { verificationDestination } from '@/features/auth/redirect';

export default async function Home() {
   let bootstrap;
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 10_000);
   try {
      const api = await createServerApiClient(controller.signal);
      const client = getQueryClient();
      bootstrap = await client.fetchQuery(bootstrapQueryOptions(api));
      if (bootstrap.onboarding.nextStep === 'VERIFY_EMAIL') redirect(verificationDestination('/'));
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      throw error;
   } finally {
      clearTimeout(timer);
   }
   if (bootstrap.onboarding.nextStep !== 'DONE' || !bootstrap.activeWorkspace)
      redirect('/onboarding');
   redirect(`/${encodeURIComponent(bootstrap.activeWorkspace.workspace.slug)}/my-issues`);
}

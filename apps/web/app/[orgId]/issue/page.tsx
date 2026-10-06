import { redirect } from 'next/navigation';

export default async function IssueIndexPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   redirect(`/${orgId}/issues`);
}

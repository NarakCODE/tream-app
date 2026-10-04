import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import Members from '@/components/common/members/members';

export default function MembersSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <div className="w-full overflow-y-auto h-full">
            <div className="max-w-4xl mx-auto px-6 py-10 pb-20">
               <div className="mb-6">
                  <h1 className="text-2xl font-medium">Members</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                     Manage members and invitations in your workspace.
                  </p>
               </div>
               <div className="rounded-lg border bg-container overflow-hidden">
                  <Members />
               </div>
            </div>
         </div>
      </MainLayout>
   );
}

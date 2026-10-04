import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import WorkspaceSettings from '@/components/common/settings/workspace-settings';

export default function WorkspaceSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <WorkspaceSettings />
      </MainLayout>
   );
}

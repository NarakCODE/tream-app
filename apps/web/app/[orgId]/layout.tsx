import { ServerBootstrap } from '@/features/bootstrap/server-bootstrap';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
   return <ServerBootstrap>{children}</ServerBootstrap>;
}

import { ServerBootstrap } from '@/features/bootstrap/server-bootstrap';

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
   return <ServerBootstrap>{children}</ServerBootstrap>;
}

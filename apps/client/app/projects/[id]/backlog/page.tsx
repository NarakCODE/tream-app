import { AppSidebar } from "@/components/app-sidebar"
import { ProjectDetailsPage } from "@/components/projects/project-details-page"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function BacklogPage({ params }: PageProps) {
  const { id } = await params
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <ProjectDetailsPage projectId={id} />
      </SidebarInset>
    </SidebarProvider>
  )
}

import type { ProjectDetails } from "@/lib/data/project-details"
import { TimeCard } from "@/components/projects/time-card"
import { BacklogCard } from "@/components/projects/backlog-card"
import { QuickLinksCard } from "@/components/projects/quick-links-card"
import { Separator } from "@/components/ui/separator"
import { ClientCard } from "@/components/projects/client-card"
import { getClientByName } from "@/lib/data/clients"

type RightMetaPanelProps = {
  project: ProjectDetails
}

export function RightMetaPanel({ project }: RightMetaPanelProps) {
  const clientName = project.source?.client
  const client = clientName ? getClientByName(clientName) : undefined

  return (
    <aside className="flex flex-col gap-10 p-4 pt-8 lg:sticky lg:self-start">
      <TimeCard time={project.time} />
      <Separator />
      <BacklogCard backlog={project.backlog} />
      {client && (
        <>
          <Separator />
          <ClientCard client={client} />
        </>
      )}
      <Separator />
      <QuickLinksCard links={project.quickLinks} />
    </aside>
  )
}

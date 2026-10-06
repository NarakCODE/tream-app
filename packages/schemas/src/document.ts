import { z } from "zod";

export const documentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  body: z.string(),
  revision: z.number().int().min(1),
  projectId: z.string().nullable(),
  initiativeId: z.string().nullable(),
  teamId: z.string().nullable(),
});
export type Document = z.infer<typeof documentSchema>;

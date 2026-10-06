import { z } from "zod";

export const initiativeSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELED"]),
  revision: z.number().int().min(1),
});
export type Initiative = z.infer<typeof initiativeSchema>;

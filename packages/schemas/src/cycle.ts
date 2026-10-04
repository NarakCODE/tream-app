import { z } from "zod";
import { cycleStatusSchema } from "./enums";

export const cycleSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  workspaceId: z.string().optional(),
  number: z.number().int().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  status: cycleStatusSchema.optional(),
  createdAt: z.string().optional(),
});
export type Cycle = z.infer<typeof cycleSchema>;

export const createCycleSchema = z.object({
  teamId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});
export type CreateCycleInput = z.infer<typeof createCycleSchema>;

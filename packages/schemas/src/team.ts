import { z } from "zod";
import { teamVisibilitySchema } from "./enums";

export const teamSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(),
  name: z.string().min(1),
  key: z.string().min(1).max(10),
  description: z.string().nullable().optional(),
  visibility: teamVisibilitySchema.default("WORKSPACE"),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Team = z.infer<typeof teamSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  key: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9]{0,9}$/,
      "Key must be uppercase alphanumeric (1-10 chars)",
    ),
  description: z.string().max(2000).optional(),
  visibility: teamVisibilitySchema.optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial();
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

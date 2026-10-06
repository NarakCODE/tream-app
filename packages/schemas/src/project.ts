import { z } from "zod";
import { projectStatusSchema } from "./enums";
import { userSchema } from "./user";

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(),
  name: z.string().min(1),
  key: z.string().optional(),
  description: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  status: projectStatusSchema.or(z.string()).default("PLANNED"),
  leadId: z.string().nullable().optional(),
  lead: userSchema.nullable().optional(),
  targetDate: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectDetailSchema = projectSchema.omit({ status: true }).extend({
  workspaceId: z.string(),
  statusId: z.string(),
  revision: z.number().int().min(1),
  teamIds: z.array(z.string()),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  key: z.string().optional(),
  description: z.string().max(100000).optional(),
  summary: z.string().max(2000).optional(),
  status: projectStatusSchema.optional(),
  leadId: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

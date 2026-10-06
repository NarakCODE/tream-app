import { z } from "zod";

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  settings: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  purgedAt: z.string().nullable(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const workspacePageQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type WorkspacePageQuery = z.infer<typeof workspacePageQuerySchema>;

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

export const updateWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  lifecycle: z.enum(["archive", "restore"]).optional(),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;

export const workspaceSelectionResponseSchema = z.object({
  workspaceId: z.string(),
});

export const workspaceDeleteResponseSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
});

export const workspacePreferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid IANA timezone"),
});
export type WorkspacePreferences = z.infer<typeof workspacePreferencesSchema>;

export const updateWorkspacePreferencesInputSchema = workspacePreferencesSchema;
export type UpdateWorkspacePreferencesInput = z.infer<
  typeof updateWorkspacePreferencesInputSchema
>;

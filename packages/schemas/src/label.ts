import { z } from "zod";

export const labelSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(),
  name: z.string().min(1),
  color: z.string(),
  description: z.string().nullable().optional(),
});
export type Label = z.infer<typeof labelSchema>;

export const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color code"),
  description: z.string().max(500).optional(),
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

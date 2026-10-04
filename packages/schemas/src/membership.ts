import { z } from "zod";
import { membershipRoleSchema } from "./enums";
import { userSchema } from "./user";

export const membershipSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  role: membershipRoleSchema,
  user: userSchema.optional(),
  createdAt: z.string().optional(),
});

export type Membership = z.infer<typeof membershipSchema>;

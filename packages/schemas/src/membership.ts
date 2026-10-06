import { z } from "zod";
import { membershipRoleSchema } from "./enums";
import { userSchema } from "./user";

export const membershipStateSchema = z.enum(["ACTIVE", "SUSPENDED", "LEFT"]);
export type MembershipState = z.infer<typeof membershipStateSchema>;

export const membershipSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string(),
  userId: z.string(),
  role: membershipRoleSchema,
  state: membershipStateSchema,
  user: userSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Membership = z.infer<typeof membershipSchema>;

export const updateMembershipInputSchema = z
  .object({
    role: membershipRoleSchema.optional(),
    state: membershipStateSchema.optional(),
  })
  .refine((input) => input.role !== undefined || input.state !== undefined, {
    message: "Set a role or membership state",
  });
export type UpdateMembershipInput = z.infer<typeof updateMembershipInputSchema>;

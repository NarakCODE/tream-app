import { z } from "zod";
import { type MembershipRole } from "./enums";

export const workspacePermissionSchema = z.enum([
  "audit.read",
  "workspace.read",
  "workspace.update",
  "workspace.delete",
  "membership.read",
  "membership.invite",
  "membership.change_role",
  "team.manage",
  "issue.read",
  "issue.update",
  "preferences.update",
]);
export type WorkspacePermission = z.infer<typeof workspacePermissionSchema>;

const administrative: WorkspacePermission[] = [
  "workspace.read",
  "workspace.update",
  "membership.read",
  "membership.invite",
  "membership.change_role",
  "team.manage",
  "issue.read",
  "issue.update",
  "preferences.update",
];

export const ROLE_PERMISSIONS: Record<
  MembershipRole,
  readonly WorkspacePermission[]
> = {
  OWNER: [...administrative, "workspace.delete", "audit.read"],
  ADMIN: administrative,
  MEMBER: [
    "workspace.read",
    "membership.read",
    "issue.read",
    "issue.update",
    "preferences.update",
  ],
  GUEST: ["workspace.read", "preferences.update"],
};

export function hasPermission(
  role: MembershipRole | null | undefined,
  permission: WorkspacePermission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

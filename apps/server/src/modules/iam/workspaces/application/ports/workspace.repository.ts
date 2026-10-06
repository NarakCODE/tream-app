import type { DatabaseTransaction } from '../../../../../database/transaction';
import type {
  memberships,
  workspaces,
  workspaceInvitations,
  workspacePreferences,
} from '../../../../../database/schema/workspace.schema';
import type { CursorTuple } from '../../../../../common/pagination/cursor';
export type Workspace = typeof workspaces.$inferSelect;
export type MembershipUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};
export type Membership = typeof memberships.$inferSelect & {
  user?: MembershipUser;
};
export type Invitation = typeof workspaceInvitations.$inferSelect;
export type Preferences = typeof workspacePreferences.$inferInsert.preferences;
export abstract class WorkspaceRepository {
  abstract workspace(
    tx: DatabaseTransaction,
    id: string,
    lock?: boolean,
  ): Promise<Workspace | undefined>;
  abstract membership(
    tx: DatabaseTransaction,
    workspaceId: string,
    userId: string,
  ): Promise<Membership | undefined>;
  abstract members(
    tx: DatabaseTransaction,
    workspaceId: string,
    limit?: number,
    cursor?: CursorTuple,
  ): Promise<Membership[]>;
  abstract countWorkspaces(
    tx: DatabaseTransaction,
    userId: string,
  ): Promise<number>;
  abstract countMembers(
    tx: DatabaseTransaction,
    workspaceId: string,
  ): Promise<number>;
  abstract countInvitations(
    tx: DatabaseTransaction,
    workspaceId: string,
  ): Promise<number>;
  abstract list(
    tx: DatabaseTransaction,
    userId: string,
    limit: number,
    cursor?: CursorTuple,
  ): Promise<Workspace[]>;
  abstract create(
    tx: DatabaseTransaction,
    workspace: typeof workspaces.$inferInsert,
    owner: typeof memberships.$inferInsert,
  ): Promise<Workspace>;
  abstract update(
    tx: DatabaseTransaction,
    id: string,
    values: Partial<typeof workspaces.$inferInsert>,
  ): Promise<Workspace>;
  abstract saveMember(
    tx: DatabaseTransaction,
    value: typeof memberships.$inferInsert,
  ): Promise<Membership>;
  abstract invitations(
    tx: DatabaseTransaction,
    workspaceId: string,
    limit?: number,
    cursor?: CursorTuple,
  ): Promise<Invitation[]>;
  abstract invitation(
    tx: DatabaseTransaction,
    workspaceId: string,
    id: string,
  ): Promise<Invitation | undefined>;
  abstract invitationByHash(
    tx: DatabaseTransaction,
    hash: string,
  ): Promise<Invitation | undefined>;
  abstract expireInvitations(
    tx: DatabaseTransaction,
    workspaceId: string,
    email: string,
    now: Date,
  ): Promise<void>;
  abstract saveInvitation(
    tx: DatabaseTransaction,
    invitation: typeof workspaceInvitations.$inferInsert,
  ): Promise<Invitation>;
  abstract updateInvitation(
    tx: DatabaseTransaction,
    id: string,
    values: Partial<typeof workspaceInvitations.$inferInsert>,
  ): Promise<Invitation>;
  abstract user(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<{ email: string; emailVerifiedAt: Date | null } | undefined>;
  abstract preference(
    tx: DatabaseTransaction,
    membershipId: string,
  ): Promise<Preferences | undefined>;
  abstract savePreference(
    tx: DatabaseTransaction,
    membershipId: string,
    preferences: Preferences,
  ): Promise<void>;
  abstract selection(
    tx: DatabaseTransaction,
    userId: string,
  ): Promise<string | undefined>;
  abstract select(
    tx: DatabaseTransaction,
    userId: string,
    workspaceId: string,
  ): Promise<void>;
}

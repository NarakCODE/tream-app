export const invitationKeys = {
   all: ['invitations'] as const,
   workspace: (workspaceId: string) => [...invitationKeys.all, workspaceId] as const,
};

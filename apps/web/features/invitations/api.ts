import { api } from '@/lib/api';
import { workspacesApi } from '@/features/workspaces/api';
import type { CreateInvitationInput } from '@repo/schemas';

export const invitationApi = {
   create(workspaceId: string, input: CreateInvitationInput, key: string) {
      return workspacesApi.invite(api, workspaceId, input, key);
   },

   accept(token: string, key: string) {
      return workspacesApi.acceptInvitation(api, token, key);
   },

   revoke(workspaceId: string, invitationId: string, key: string) {
      return workspacesApi.revokeInvitation(api, workspaceId, invitationId, key);
   },
};

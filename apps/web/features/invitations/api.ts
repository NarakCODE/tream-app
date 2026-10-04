import { api } from '@/lib/api';
import {
   acceptInvitationInputSchema,
   apiEnvelopeSchema,
   createInvitationInputSchema,
   invitationSchema,
   membershipSchema,
} from '@repo/schemas';

export const invitationApi = {
   async create(workspaceId: string, email: string, key: string) {
      const response = await api.post(
         `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
         apiEnvelopeSchema(invitationSchema),
         createInvitationInputSchema.parse({ email, role: 'MEMBER' }),
         { headers: { 'Idempotency-Key': key } }
      );
      return response.data;
   },
   async accept(token: string, key: string) {
      const response = await api.post(
         '/api/v1/workspaces/invitations/accept',
         apiEnvelopeSchema(membershipSchema),
         acceptInvitationInputSchema.parse({ token }),
         { headers: { 'Idempotency-Key': key } }
      );
      return response.data;
   },
};

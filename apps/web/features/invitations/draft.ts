export interface InvitationDraft {
   emails: string;
   queued: string[];
}

const draftKey = (scope: string) => `tream:invitation-draft:${scope}`;

export function readInvitationDraft(scope: string): InvitationDraft {
   const saved = localStorage.getItem(draftKey(scope));
   if (!saved) return { emails: '', queued: [] };
   const draft: unknown = JSON.parse(saved);
   if (
      !draft ||
      typeof draft !== 'object' ||
      !('emails' in draft) ||
      typeof draft.emails !== 'string' ||
      !('queued' in draft) ||
      !Array.isArray(draft.queued) ||
      draft.queued.some((email) => typeof email !== 'string')
   ) {
      throw new Error('Saved invitation progress is invalid.');
   }
   return { emails: draft.emails, queued: draft.queued as string[] };
}

export function saveInvitationDraft(scope: string, draft: InvitationDraft) {
   localStorage.setItem(draftKey(scope), JSON.stringify(draft));
}

export const invitationStorageError =
   'Invitation progress could not be saved. Enable browser storage for this site, then reload before retrying. You can also skip invitations for now.';

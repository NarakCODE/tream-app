import type {
  EmailContents,
  EmailSearch,
  NormalizedDraft,
  NormalizedEmail,
  NormalizedEmailThread,
} from '../../domain/normalized-email';

export const GMAIL_MAIL = Symbol('GMAIL_MAIL');

export interface GmailMailPort {
  search(accessToken: string, search: EmailSearch): Promise<NormalizedEmail[]>;
  getMessage(accessToken: string, messageId: string): Promise<NormalizedEmail>;
  getThread(
    accessToken: string,
    threadId: string,
  ): Promise<NormalizedEmailThread>;
  createDraft(
    accessToken: string,
    contents: EmailContents,
  ): Promise<NormalizedDraft>;
  getDraft(accessToken: string, draftId: string): Promise<NormalizedDraft>;
  updateDraft(
    accessToken: string,
    draftId: string,
    contents: EmailContents,
  ): Promise<NormalizedDraft>;
  sendDraft(accessToken: string, draftId: string): Promise<NormalizedEmail>;
  send(accessToken: string, contents: EmailContents): Promise<NormalizedEmail>;
}

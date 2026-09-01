export interface EmailAddress {
  name: string | null;
  address: string;
}

export interface NormalizedEmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
}

export interface NormalizedEmail {
  id: string;
  threadId: string;
  from: EmailAddress | null;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  snippet: string;
  labels: string[];
  attachments: NormalizedEmailAttachment[];
  sentAt: string;
}

export interface NormalizedEmailThread {
  id: string;
  messages: NormalizedEmail[];
}

export interface NormalizedDraft {
  id: string;
  message: NormalizedEmail;
}

export interface EmailSearch {
  query?: string;
  from?: string;
  to?: string;
  after?: string;
  before?: string;
  limit: number;
}

export interface EmailContents {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  threadId?: string;
}

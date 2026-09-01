import { Inject, Injectable } from '@nestjs/common';
import type { GmailMailPort } from '../application/ports/gmail-mail.port';
import type {
  EmailAddress,
  EmailContents,
  EmailSearch,
  NormalizedDraft,
  NormalizedEmail,
  NormalizedEmailAttachment,
  NormalizedEmailThread,
} from '../domain/normalized-email';
import {
  GMAIL_INTEGRATION_CONFIG,
  type GmailIntegrationConfig,
} from '../integrations.config';
import { GoogleApiError } from './google-api.error';

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailDraft {
  id?: string;
  message?: GmailMessage;
}

@Injectable()
export class GoogleGmailMailAdapter implements GmailMailPort {
  constructor(
    @Inject(GMAIL_INTEGRATION_CONFIG)
    private readonly config: GmailIntegrationConfig,
  ) {}

  async search(
    accessToken: string,
    search: EmailSearch,
  ): Promise<NormalizedEmail[]> {
    const parameters = new URLSearchParams({
      maxResults: String(search.limit),
      q: this.buildSearchQuery(search),
    });
    const page = await this.request<{ messages?: GmailMessage[] }>(
      accessToken,
      `/gmail/v1/users/me/messages?${parameters.toString()}`,
    );
    return Promise.all(
      (page.messages ?? []).flatMap((message) =>
        typeof message.id === 'string'
          ? [this.getMessage(accessToken, message.id)]
          : [],
      ),
    );
  }

  async getMessage(
    accessToken: string,
    messageId: string,
  ): Promise<NormalizedEmail> {
    const message = await this.request<GmailMessage>(
      accessToken,
      `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    );
    return this.normalizeMessage(message);
  }

  async getThread(
    accessToken: string,
    threadId: string,
  ): Promise<NormalizedEmailThread> {
    const thread = await this.request<{
      id?: string;
      messages?: GmailMessage[];
    }>(
      accessToken,
      `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    );
    if (typeof thread.id !== 'string') {
      throw this.invalidPayload('thread');
    }
    return {
      id: thread.id,
      messages: (thread.messages ?? []).map((message) =>
        this.normalizeMessage(message),
      ),
    };
  }

  async createDraft(
    accessToken: string,
    contents: EmailContents,
  ): Promise<NormalizedDraft> {
    const draft = await this.request<GmailDraft>(
      accessToken,
      '/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        body: JSON.stringify({
          message: this.rawMessage(contents),
        }),
      },
    );
    return this.resolveDraft(accessToken, draft);
  }

  async getDraft(
    accessToken: string,
    draftId: string,
  ): Promise<NormalizedDraft> {
    const draft = await this.request<GmailDraft>(
      accessToken,
      `/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}?format=full`,
    );
    if (typeof draft.id !== 'string' || draft.message === undefined) {
      throw this.invalidPayload('draft');
    }
    return { id: draft.id, message: this.normalizeMessage(draft.message) };
  }

  async updateDraft(
    accessToken: string,
    draftId: string,
    contents: EmailContents,
  ): Promise<NormalizedDraft> {
    const draft = await this.request<GmailDraft>(
      accessToken,
      `/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ message: this.rawMessage(contents) }),
      },
    );
    return this.resolveDraft(accessToken, draft);
  }

  async sendDraft(
    accessToken: string,
    draftId: string,
  ): Promise<NormalizedEmail> {
    const sent = await this.request<GmailMessage>(
      accessToken,
      '/gmail/v1/users/me/drafts/send',
      { method: 'POST', body: JSON.stringify({ id: draftId }) },
    );
    if (typeof sent.id !== 'string') throw this.invalidPayload('message');
    return this.getMessage(accessToken, sent.id);
  }

  async send(
    accessToken: string,
    contents: EmailContents,
  ): Promise<NormalizedEmail> {
    const sent = await this.request<GmailMessage>(
      accessToken,
      '/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        body: JSON.stringify(this.rawMessage(contents)),
      },
    );
    if (typeof sent.id !== 'string') throw this.invalidPayload('message');
    return this.getMessage(accessToken, sent.id);
  }

  private async resolveDraft(
    accessToken: string,
    draft: GmailDraft,
  ): Promise<NormalizedDraft> {
    if (typeof draft.id !== 'string' || typeof draft.message?.id !== 'string') {
      throw this.invalidPayload('draft');
    }
    return {
      id: draft.id,
      message: await this.getMessage(accessToken, draft.message.id),
    };
  }

  private rawMessage(contents: EmailContents): {
    raw: string;
    threadId?: string;
  } {
    const headers = [
      `To: ${contents.to.join(', ')}`,
      ...(contents.cc === undefined ? [] : [`Cc: ${contents.cc.join(', ')}`]),
      ...(contents.bcc === undefined
        ? []
        : [`Bcc: ${contents.bcc.join(', ')}`]),
      `Subject: ${this.encodeHeader(contents.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
    ];
    const raw = Buffer.from(
      `${headers.join('\r\n')}\r\n\r\n${contents.body}`,
      'utf8',
    ).toString('base64url');
    return {
      raw,
      ...(contents.threadId === undefined
        ? {}
        : { threadId: contents.threadId }),
    };
  }

  private encodeHeader(value: string): string {
    return /[^\x20-\x7E]/.test(value)
      ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
      : value;
  }

  private buildSearchQuery(search: EmailSearch): string {
    return [
      search.query,
      search.from === undefined ? undefined : `from:${search.from}`,
      search.to === undefined ? undefined : `to:${search.to}`,
      search.after === undefined
        ? undefined
        : `after:${search.after.replaceAll('-', '/')}`,
      search.before === undefined
        ? undefined
        : `before:${search.before.replaceAll('-', '/')}`,
    ]
      .filter((part): part is string => part !== undefined && part !== '')
      .join(' ');
  }

  private normalizeMessage(message: GmailMessage): NormalizedEmail {
    if (
      typeof message.id !== 'string' ||
      typeof message.threadId !== 'string' ||
      message.payload === undefined
    ) {
      throw this.invalidPayload('message');
    }
    const headers = new Map(
      (message.payload.headers ?? []).flatMap((header) =>
        typeof header.name === 'string' && typeof header.value === 'string'
          ? [[header.name.toLowerCase(), header.value] as const]
          : [],
      ),
    );
    const bodies = this.collectBodies(message.payload);
    const dateHeader = headers.get('date');
    const parsedDate =
      dateHeader === undefined ? Number.NaN : Date.parse(dateHeader);
    const internalDate = Number(message.internalDate);
    const sentAt = Number.isFinite(parsedDate)
      ? new Date(parsedDate)
      : Number.isFinite(internalDate)
        ? new Date(internalDate)
        : null;
    if (sentAt === null || Number.isNaN(sentAt.getTime())) {
      throw this.invalidPayload('message date');
    }
    return {
      id: message.id,
      threadId: message.threadId,
      from: this.parseAddresses(headers.get('from')).at(0) ?? null,
      to: this.parseAddresses(headers.get('to')),
      cc: this.parseAddresses(headers.get('cc')),
      bcc: this.parseAddresses(headers.get('bcc')),
      subject: headers.get('subject') ?? '',
      textBody: bodies.text,
      htmlBody: bodies.html,
      snippet: message.snippet ?? '',
      labels: message.labelIds ?? [],
      attachments: bodies.attachments,
      sentAt: sentAt.toISOString(),
    };
  }

  private collectBodies(part: GmailPart): {
    text: string | null;
    html: string | null;
    attachments: NormalizedEmailAttachment[];
  } {
    let text: string | null = null;
    let html: string | null = null;
    const attachments: NormalizedEmailAttachment[] = [];
    const visit = (current: GmailPart): void => {
      const filename = current.filename ?? '';
      if (filename !== '') {
        attachments.push({
          filename,
          mimeType: current.mimeType ?? 'application/octet-stream',
          size: current.body?.size ?? 0,
          attachmentId: current.body?.attachmentId ?? null,
        });
      } else if (typeof current.body?.data === 'string') {
        const decoded = Buffer.from(current.body.data, 'base64url').toString(
          'utf8',
        );
        if (current.mimeType === 'text/plain' && text === null) text = decoded;
        if (current.mimeType === 'text/html' && html === null) html = decoded;
      }
      current.parts?.forEach(visit);
    };
    visit(part);
    return { text, html, attachments };
  }

  private parseAddresses(value: string | undefined): EmailAddress[] {
    if (value === undefined) return [];
    return value.split(',').flatMap((part) => {
      const normalized = part.trim();
      const angle = /^(.*?)\s*<([^<>]+)>$/.exec(normalized);
      const address = (angle?.[2] ?? normalized).trim().toLowerCase();
      if (!address.includes('@')) return [];
      const rawName = angle?.[1]?.trim().replace(/^"|"$/g, '') ?? '';
      return [{ name: rawName === '' ? null : rawName, address }];
    });
  }

  private async request<T>(
    accessToken: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const base = (
      this.config.apiBaseUrl ?? 'https://gmail.googleapis.com'
    ).replace(/\/$/, '');
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new GoogleApiError(
        'Gmail API request failed.',
        response.status,
        await response.text(),
      );
    }
    return (await response.json()) as T;
  }

  private invalidPayload(resource: string): GoogleApiError {
    return new GoogleApiError(
      `Google returned an invalid Gmail ${resource} payload.`,
      502,
      '',
    );
  }
}

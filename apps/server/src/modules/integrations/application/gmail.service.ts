import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import type {
  EmailContents,
  EmailSearch,
  NormalizedDraft,
  NormalizedEmail,
  NormalizedEmailThread,
} from '../domain/normalized-email';
import type { IntegrationAccess } from './ports/integrations-repository.port';
import { GMAIL_MAIL, type GmailMailPort } from './ports/gmail-mail.port';
import {
  INTEGRATION_EVENT_PUBLISHER,
  type IntegrationEventPublisher,
} from './ports/integration-event-publisher.port';
import { IntegrationsService } from './integrations.service';

@Injectable()
export class GmailService {
  constructor(
    private readonly integrations: IntegrationsService,
    @Inject(GMAIL_MAIL) private readonly gmail: GmailMailPort,
    @Inject(INTEGRATION_EVENT_PUBLISHER)
    private readonly events: IntegrationEventPublisher,
  ) {}

  search(
    access: IntegrationAccess,
    search: EmailSearch,
  ): Promise<NormalizedEmail[]> {
    return this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.search(accessToken, search),
    );
  }

  getMessage(
    access: IntegrationAccess,
    messageId: string,
  ): Promise<NormalizedEmail> {
    return this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.getMessage(accessToken, messageId),
    );
  }

  getThread(
    access: IntegrationAccess,
    threadId: string,
  ): Promise<NormalizedEmailThread> {
    return this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.getThread(accessToken, threadId),
    );
  }

  createDraft(
    access: IntegrationAccess,
    contents: EmailContents,
  ): Promise<NormalizedDraft> {
    return this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.createDraft(accessToken, contents),
    );
  }

  updateDraft(
    access: IntegrationAccess,
    draftId: string,
    changes: Partial<EmailContents>,
  ): Promise<NormalizedDraft> {
    if (Object.keys(changes).length === 0) {
      throw new AppException(
        AppErrorCode.BadRequest,
        'At least one draft field must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.integrations.withAccessToken(
      access.integration,
      async (token) => {
        const currentDraft = await this.gmail.getDraft(token, draftId);
        const current = currentDraft.message;
        return this.gmail.updateDraft(token, draftId, {
          to: changes.to ?? current.to.map(({ address }) => address),
          cc: changes.cc ?? current.cc.map(({ address }) => address),
          bcc: changes.bcc ?? current.bcc.map(({ address }) => address),
          subject: changes.subject ?? current.subject,
          body: changes.body ?? current.textBody ?? '',
          threadId: changes.threadId ?? current.threadId,
        });
      },
    );
  }

  async sendDraft(
    access: IntegrationAccess,
    draftId: string,
  ): Promise<NormalizedEmail> {
    const sent = await this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.sendDraft(accessToken, draftId),
    );
    await this.publishSent(access, sent);
    return sent;
  }

  async send(
    access: IntegrationAccess,
    contents: EmailContents,
  ): Promise<NormalizedEmail> {
    const sent = await this.integrations.withAccessToken(
      access.integration,
      (accessToken) => this.gmail.send(accessToken, contents),
    );
    await this.publishSent(access, sent);
    return sent;
  }

  async sendForAgent(
    workspaceId: string,
    integrationId: string,
    contents: EmailContents,
  ): Promise<NormalizedEmail> {
    const integration =
      await this.integrations.findForInternalUse(integrationId);
    if (integration.workspaceId !== workspaceId) {
      throw new AppException(
        AppErrorCode.Forbidden,
        'The integration does not belong to the agent workspace.',
        HttpStatus.FORBIDDEN,
      );
    }
    const sent = await this.integrations.withAccessToken(
      integration,
      (accessToken) => this.gmail.send(accessToken, contents),
    );
    await this.events.publish({
      type: 'email.sent',
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      messageId: sent.id,
      threadId: sent.threadId,
      to: sent.to.map(({ address }) => address),
      subject: sent.subject,
    });
    return sent;
  }

  private publishSent(
    access: IntegrationAccess,
    sent: NormalizedEmail,
  ): Promise<void> {
    return this.events.publish({
      type: 'email.sent',
      workspaceId: access.integration.workspaceId,
      integrationId: access.integration.id,
      messageId: sent.id,
      threadId: sent.threadId,
      to: sent.to.map(({ address }) => address),
      subject: sent.subject,
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  EmailContents,
  NormalizedEmail,
} from '../domain/normalized-email';
import {
  AGENT_MAIL_APPROVAL,
  type AgentMailApprovalPort,
} from './ports/agent-mail-approval.port';
import { GmailService } from './gmail.service';

@Injectable()
export class AgentGmailService {
  constructor(
    private readonly gmail: GmailService,
    @Inject(AGENT_MAIL_APPROVAL)
    private readonly approvals: AgentMailApprovalPort,
  ) {}

  async send(input: {
    workspaceId: string;
    integrationId: string;
    agentRunId: string;
    approvalId: string;
    contents: EmailContents;
  }): Promise<NormalizedEmail> {
    await this.approvals.assertApproved({
      workspaceId: input.workspaceId,
      agentRunId: input.agentRunId,
      approvalId: input.approvalId,
      action: 'mail.send',
      payload: { integrationId: input.integrationId, ...input.contents },
    });
    return this.gmail.sendForAgent(
      input.workspaceId,
      input.integrationId,
      input.contents,
    );
  }
}

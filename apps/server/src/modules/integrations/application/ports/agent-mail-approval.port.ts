export const AGENT_MAIL_APPROVAL = Symbol('AGENT_MAIL_APPROVAL');

export interface AgentMailApprovalPort {
  assertApproved(input: {
    workspaceId: string;
    agentRunId: string;
    approvalId: string;
    action: 'mail.send';
    payload: Record<string, unknown>;
  }): Promise<void>;
}

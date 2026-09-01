export const INTEGRATION_EVENT_PUBLISHER = Symbol(
  'INTEGRATION_EVENT_PUBLISHER',
);

export type IntegrationEvent =
  | {
      type: 'integration.connected';
      workspaceId: string;
      integrationId: string;
      provider: 'gmail';
      accountEmail: string;
    }
  | {
      type: 'integration.auth_failed';
      workspaceId: string;
      integrationId: string;
      provider: 'gmail';
      reason: string;
    }
  | {
      type: 'email.sent';
      workspaceId: string;
      integrationId: string;
      messageId: string;
      threadId: string;
      to: string[];
      subject: string;
    };

export interface IntegrationEventPublisher {
  publish(event: IntegrationEvent): Promise<void>;
}

import {
  type DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { AgentGmailService } from './application/agent-gmail.service';
import { GmailService } from './application/gmail.service';
import { IntegrationsService } from './application/integrations.service';
import { GMAIL_MAIL } from './application/ports/gmail-mail.port';
import { GMAIL_OAUTH } from './application/ports/gmail-oauth.port';
import { INTEGRATIONS_REPOSITORY } from './application/ports/integrations-repository.port';
import { OAUTH_VAULT } from './application/ports/oauth-vault.port';
import { AesGcmOAuthVault } from './infrastructure/aes-gcm-oauth.vault';
import { DrizzleIntegrationsRepository } from './infrastructure/drizzle-integrations.repository';
import { GoogleGmailMailAdapter } from './infrastructure/google-gmail-mail.adapter';
import { GoogleGmailOAuthAdapter } from './infrastructure/google-gmail-oauth.adapter';
import { IntegrationAccessGuard } from './infrastructure/integration-access.guard';
import { GmailCallbackController } from './presentation/gmail-callback.controller';
import { IntegrationProvidersController } from './presentation/integration-providers.controller';
import { IntegrationsController } from './presentation/integrations.controller';
import { WorkspaceIntegrationsController } from './presentation/workspace-integrations.controller';

export interface IntegrationsModuleOptions {
  imports?: ModuleMetadata['imports'];
  gmailConfigProvider: Provider;
  eventPublisherProvider: Provider;
  agentMailApprovalProvider: Provider;
}

@Module({})
export class IntegrationsModule {
  static register(options: IntegrationsModuleOptions): DynamicModule {
    return {
      module: IntegrationsModule,
      imports: [DatabaseModule, IamModule, ...(options.imports ?? [])],
      controllers: [
        IntegrationProvidersController,
        WorkspaceIntegrationsController,
        GmailCallbackController,
        IntegrationsController,
      ],
      providers: [
        IntegrationsService,
        GmailService,
        AgentGmailService,
        IntegrationAccessGuard,
        DrizzleIntegrationsRepository,
        GoogleGmailOAuthAdapter,
        GoogleGmailMailAdapter,
        AesGcmOAuthVault,
        options.gmailConfigProvider,
        options.eventPublisherProvider,
        options.agentMailApprovalProvider,
        {
          provide: INTEGRATIONS_REPOSITORY,
          useExisting: DrizzleIntegrationsRepository,
        },
        { provide: GMAIL_OAUTH, useExisting: GoogleGmailOAuthAdapter },
        { provide: GMAIL_MAIL, useExisting: GoogleGmailMailAdapter },
        { provide: OAUTH_VAULT, useExisting: AesGcmOAuthVault },
      ],
      exports: [AgentGmailService, IntegrationsService],
    };
  }
}

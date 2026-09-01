import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { AgentCoreService } from './application/agent-core.service';
import {
  AGENT_CORE_REPOSITORY,
  AGENT_EVENT_GATEWAY,
  AGENT_LLM_GATEWAY,
  AGENT_RUN_QUEUE,
  AGENT_SKILL_GATEWAY,
} from './application/ports/agent-core-repository.port';
import {
  DurableAgentRunQueue,
  UnconfiguredAgentEventGateway,
  UnconfiguredAgentLlmGateway,
  UnconfiguredAgentSkillGateway,
} from './infrastructure/agent-runtime.adapters';
import { DrizzleAgentCoreRepository } from './infrastructure/drizzle-agent-core.repository';
import { AgentsController } from './presentation/agents.controller';
import { ApprovalsController } from './presentation/approvals.controller';
import { RunsController } from './presentation/runs.controller';
import {
  AgentTriggersController,
  ConditionsController,
  TriggersController,
} from './presentation/triggers.controller';
import { WorkspaceAgentCoreController } from './presentation/workspace-agent-core.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [
    WorkspaceAgentCoreController,
    AgentsController,
    AgentTriggersController,
    TriggersController,
    ConditionsController,
    RunsController,
    ApprovalsController,
  ],
  providers: [
    AgentCoreService,
    DrizzleAgentCoreRepository,
    DurableAgentRunQueue,
    UnconfiguredAgentLlmGateway,
    UnconfiguredAgentSkillGateway,
    UnconfiguredAgentEventGateway,
    { provide: AGENT_CORE_REPOSITORY, useExisting: DrizzleAgentCoreRepository },
    { provide: AGENT_RUN_QUEUE, useExisting: DurableAgentRunQueue },
    { provide: AGENT_LLM_GATEWAY, useExisting: UnconfiguredAgentLlmGateway },
    {
      provide: AGENT_SKILL_GATEWAY,
      useExisting: UnconfiguredAgentSkillGateway,
    },
    {
      provide: AGENT_EVENT_GATEWAY,
      useExisting: UnconfiguredAgentEventGateway,
    },
  ],
  exports: [
    AGENT_CORE_REPOSITORY,
    AGENT_RUN_QUEUE,
    AGENT_LLM_GATEWAY,
    AGENT_SKILL_GATEWAY,
    AGENT_EVENT_GATEWAY,
  ],
})
export class AgentCoreModule {}

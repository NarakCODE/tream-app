import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import {
  AGENT_CORE_REPOSITORY,
  type AgentCoreRepository,
  type AgentEventGateway,
  type AgentLlmGateway,
  type AgentRunQueue,
  type AgentSkillGateway,
} from '../application/ports/agent-core-repository.port';

@Injectable()
export class DurableAgentRunQueue implements AgentRunQueue {
  constructor(
    @Inject(AGENT_CORE_REPOSITORY)
    private readonly repository: AgentCoreRepository,
  ) {}
  async enqueue(runId: string): Promise<void> {
    await this.repository.enqueueRun(runId);
  }
}
const unavailable = (capability: string): AppException =>
  new AppException(
    AppErrorCode.ServiceUnavailable,
    `${capability} runtime is not configured.`,
    HttpStatus.SERVICE_UNAVAILABLE,
  );
@Injectable()
export class UnconfiguredAgentLlmGateway implements AgentLlmGateway {
  infer(input: unknown): Promise<unknown> {
    void input;
    return Promise.reject(unavailable('Agent LLM'));
  }
}
@Injectable()
export class UnconfiguredAgentSkillGateway implements AgentSkillGateway {
  execute(skill: string, input: unknown): Promise<unknown> {
    void skill;
    void input;
    return Promise.reject(unavailable('Agent skill'));
  }
}
@Injectable()
export class UnconfiguredAgentEventGateway implements AgentEventGateway {
  publish(type: string, payload: unknown): Promise<void> {
    void type;
    void payload;
    return Promise.reject(unavailable('Agent event'));
  }
}

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import { ResourceConflictException } from '../../../common/exceptions/resource-conflict.exception';
import { ResourceNotFoundException } from '../../../common/exceptions/resource-not-found.exception';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import {
  BUILT_IN_SKILLS,
  canTransitionRun,
  type Agent,
  type AgentRun,
  type AgentTrigger,
  type Approval,
  type ApprovalStatus,
  type RunStatus,
  type TriggerCondition,
} from '../domain/agent-core';
import {
  AGENT_CORE_REPOSITORY,
  AGENT_RUN_QUEUE,
  type AgentCoreRepository,
  type AgentRunQueue,
  type ConditionData,
  type CreateAgentData,
  type RunLog,
  type RunStep,
  type ToolCall,
  type TriggerData,
  type UpdateAgentData,
} from './ports/agent-core-repository.port';

@Injectable()
export class AgentCoreService {
  constructor(
    @Inject(AGENT_CORE_REPOSITORY)
    private readonly repository: AgentCoreRepository,
    @Inject(AGENT_RUN_QUEUE) private readonly queue: AgentRunQueue,
  ) {}
  private forbidden(): AppException {
    return new AppException(
      AppErrorCode.Forbidden,
      'You do not have access to this agent resource.',
      HttpStatus.FORBIDDEN,
    );
  }
  private required<T>(value: T | null, _resource: string, _id: string): T {
    void _resource;
    void _id;
    if (value === null) throw this.forbidden();
    return value;
  }
  async listAgents(workspaceId: string, userId: string): Promise<Agent[]> {
    return this.required(
      await this.repository.listAgents(workspaceId, userId),
      'Agent',
      workspaceId,
    );
  }
  async createAgent(
    workspaceId: string,
    userId: string,
    data: CreateAgentData,
  ): Promise<Agent> {
    this.assertSkills(data.skills);
    return this.required(
      await this.repository.createAgent(
        workspaceId,
        userId,
        `agt_${ulid()}`,
        data,
      ),
      'Agent',
      workspaceId,
    );
  }
  async getAgent(id: string, userId: string): Promise<Agent> {
    return this.required(
      await this.repository.getAgent(id, userId),
      'Agent',
      id,
    );
  }
  async updateAgent(
    id: string,
    userId: string,
    data: UpdateAgentData,
  ): Promise<Agent> {
    if (data.skills) this.assertSkills(data.skills);
    return this.required(
      await this.repository.updateAgent(id, userId, data),
      'Agent',
      id,
    );
  }
  async setEnabled(
    id: string,
    userId: string,
    enabled: boolean,
  ): Promise<Agent> {
    return this.required(
      await this.repository.setAgentEnabled(id, userId, enabled),
      'Agent',
      id,
    );
  }
  async duplicate(id: string, userId: string): Promise<Agent> {
    return this.required(
      await this.repository.duplicateAgent(id, userId, `agt_${ulid()}`),
      'Agent',
      id,
    );
  }
  async deleteAgent(id: string, userId: string): Promise<void> {
    if (!(await this.repository.deleteAgent(id, userId)))
      throw this.forbidden();
  }
  async listTriggers(agentId: string, userId: string): Promise<AgentTrigger[]> {
    return this.required(
      await this.repository.listTriggers(agentId, userId),
      'Agent',
      agentId,
    );
  }
  async createTrigger(
    agentId: string,
    userId: string,
    data: TriggerData,
  ): Promise<AgentTrigger> {
    return this.required(
      await this.repository.createTrigger(
        agentId,
        userId,
        `trg_${ulid()}`,
        data,
      ),
      'Trigger',
      agentId,
    );
  }
  async getTrigger(
    id: string,
    userId: string,
  ): Promise<AgentTrigger & { conditions: TriggerCondition[] }> {
    return this.required(
      await this.repository.getTrigger(id, userId),
      'Trigger',
      id,
    );
  }
  async updateTrigger(
    id: string,
    userId: string,
    data: Partial<TriggerData>,
  ): Promise<AgentTrigger> {
    const current = await this.getTrigger(id, userId);
    const type = data.type ?? current.type;
    const merged: TriggerData = {
      type,
      eventType:
        type === 'EVENT' ? (data.eventType ?? current.eventType) : null,
      cronExpression:
        type === 'SCHEDULE'
          ? (data.cronExpression ?? current.cronExpression)
          : null,
      integrationId:
        data.integrationId === undefined
          ? current.integrationId
          : data.integrationId,
      isEnabled: data.isEnabled ?? current.isEnabled,
    };
    if (
      (type === 'EVENT' && !merged.eventType) ||
      (type === 'SCHEDULE' && !merged.cronExpression)
    )
      throw new ResourceConflictException(
        'Trigger configuration is incomplete for its type.',
      );
    return this.required(
      await this.repository.updateTrigger(id, userId, merged),
      'Trigger',
      id,
    );
  }
  async deleteTrigger(id: string, userId: string): Promise<void> {
    if (!(await this.repository.deleteTrigger(id, userId)))
      throw this.forbidden();
  }
  async createCondition(
    id: string,
    userId: string,
    data: ConditionData,
  ): Promise<TriggerCondition> {
    return this.required(
      await this.repository.createCondition(id, userId, `cnd_${ulid()}`, data),
      'Trigger',
      id,
    );
  }
  async deleteCondition(id: string, userId: string): Promise<void> {
    if (!(await this.repository.deleteCondition(id, userId)))
      throw this.forbidden();
  }
  async run(
    agentId: string,
    userId: string,
    input: Record<string, unknown>,
  ): Promise<AgentRun> {
    const runId = `run_${ulid()}`;
    const run = await this.repository.createRun(agentId, userId, runId, input);
    if (run === 'disabled')
      throw new ResourceConflictException('Inactive agents cannot be run.', {
        agentId,
      });
    const created = this.required(run, 'Agent', agentId);
    await this.queue.enqueue(runId);
    return created;
  }
  async listRuns(
    workspaceId: string,
    userId: string,
    query: {
      agentId?: string;
      status?: RunStatus;
      from?: string;
      to?: string;
      cursor?: string;
      limit: number;
    },
  ): Promise<CursorPaginatedResult<AgentRun>> {
    const repositoryQuery = {
      limit: query.limit,
      ...(query.agentId === undefined ? {} : { agentId: query.agentId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.from === undefined ? {} : { from: new Date(query.from) }),
      ...(query.to === undefined ? {} : { to: new Date(query.to) }),
      ...(query.cursor === undefined
        ? {}
        : { cursor: decodeCursor(query.cursor) }),
    };
    const page = this.required(
      await this.repository.listRuns(workspaceId, userId, repositoryQuery),
      'Agent runs',
      workspaceId,
    );
    const last = page.items.at(-1);
    return {
      paginationType: 'cursor',
      items: page.items,
      cursor: query.cursor ?? null,
      nextCursor:
        page.hasNext && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
      hasNext: page.hasNext,
      limit: query.limit,
      total: page.total,
    };
  }
  async getRun(id: string, userId: string): Promise<AgentRun> {
    return this.required(
      await this.repository.getRun(id, userId),
      'Agent run',
      id,
    );
  }
  async cancelRun(id: string, userId: string): Promise<AgentRun> {
    const current = await this.getRun(id, userId);
    const allowed = (
      ['QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL'] as RunStatus[]
    ).filter((from) => canTransitionRun(from, 'CANCELLED'));
    if (!allowed.includes(current.status))
      throw new ResourceConflictException(
        `Run in ${current.status} cannot be cancelled.`,
      );
    return this.required(
      await this.repository.transitionRun(id, userId, allowed, 'CANCELLED'),
      'Agent run',
      id,
    );
  }
  async retryRun(id: string, userId: string): Promise<AgentRun> {
    const old = await this.getRun(id, userId);
    if (!canTransitionRun(old.status, 'QUEUED'))
      throw new ResourceConflictException('Only failed runs can be retried.');
    const run = this.required(
      await this.repository.retryRun(id, userId, `run_${ulid()}`),
      'Agent run',
      id,
    );
    await this.queue.enqueue(run.id);
    return run;
  }
  async listSteps(id: string, userId: string): Promise<RunStep[]> {
    return this.required(
      await this.repository.listSteps(id, userId),
      'Agent run',
      id,
    );
  }
  async listToolCalls(id: string, userId: string): Promise<ToolCall[]> {
    return this.required(
      await this.repository.listToolCalls(id, userId),
      'Agent run',
      id,
    );
  }
  async listLogs(id: string, userId: string): Promise<RunLog[]> {
    return this.required(
      await this.repository.listLogs(id, userId),
      'Agent run',
      id,
    );
  }
  async listLogsAfter(
    id: string,
    userId: string,
    after?: { createdAt: Date; id: string },
  ): Promise<RunLog[]> {
    return this.required(
      await this.repository.listLogs(id, userId, after),
      'Agent run',
      id,
    );
  }
  async listApprovals(
    workspaceId: string,
    userId: string,
    status?: ApprovalStatus,
  ): Promise<Approval[]> {
    return this.required(
      await this.repository.listApprovals(
        workspaceId,
        userId,
        status ? { status } : {},
      ),
      'Approvals',
      workspaceId,
    );
  }
  async getApproval(id: string, userId: string): Promise<Approval> {
    return this.required(
      await this.repository.getApproval(id, userId),
      'Approval',
      id,
    );
  }
  async decideApproval(
    id: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | null,
  ): Promise<Approval> {
    const result = await this.repository.decideApproval(
      id,
      userId,
      decision,
      reason,
    );
    if (result === 'conflict')
      throw new ResourceConflictException('Approval is no longer pending.');
    const approval = this.required(result, 'Approval', id);
    if (decision === 'APPROVED') await this.queue.enqueue(approval.runId);
    return approval;
  }
  private assertSkills(skills: string[]): void {
    const invalid = skills.filter(
      (skill) => !(BUILT_IN_SKILLS as readonly string[]).includes(skill),
    );
    if (invalid.length)
      throw new ResourceNotFoundException('Skill', invalid.join(', '));
    if (new Set(skills).size !== skills.length)
      throw new ResourceConflictException('Skill permissions must be unique.');
  }
}

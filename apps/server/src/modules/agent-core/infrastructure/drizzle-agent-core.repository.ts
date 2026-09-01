import { Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  gte,
} from 'drizzle-orm';
import { ulid } from 'ulid';
import { DatabaseService } from '../../../database/database.service';
import {
  memberships,
  workspaces,
} from '../../../database/schema/workspace.schema';
import {
  agentRunJobs,
  agentRunLogs,
  agentRuns,
  agentRunSteps,
  agentToolCalls,
  agents,
  agentTriggers,
  approvals,
  triggerConditions,
} from '../../../database/schema/agent-core.schema';
import type {
  AgentCoreRepository,
  ApprovalListQuery,
  ConditionData,
  CreateAgentData,
  Page,
  RunListQuery,
  RunLog,
  RunStep,
  ToolCall,
  TriggerData,
  UpdateAgentData,
} from '../application/ports/agent-core-repository.port';
import type {
  Agent,
  AgentRun,
  AgentTrigger,
  Approval,
  RunStatus,
  TriggerCondition,
} from '../domain/agent-core';
import { canMutateAgents, canReadAgents } from '../domain/agent-core';

const first = <T>(rows: T[]): T | null => rows[0] ?? null;
@Injectable()
export class DrizzleAgentCoreRepository implements AgentCoreRepository {
  constructor(private readonly database: DatabaseService) {}

  private async role(
    db: typeof this.database.db,
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const row = first(
      await db
        .select({ role: memberships.role })
        .from(memberships)
        .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
        .where(
          and(
            eq(memberships.workspaceId, workspaceId),
            eq(memberships.userId, userId),
            isNull(workspaces.deletedAt),
          ),
        )
        .limit(1),
    );
    return row?.role ?? null;
  }
  private async agentWorkspace(agentId: string): Promise<string | null> {
    const row = first(
      await this.database.db
        .select({ workspaceId: agents.workspaceId })
        .from(agents)
        .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
        .limit(1),
    );
    return row?.workspaceId ?? null;
  }
  private async triggerWorkspace(triggerId: string): Promise<string | null> {
    const row = first(
      await this.database.db
        .select({ workspaceId: agents.workspaceId })
        .from(agentTriggers)
        .innerJoin(agents, eq(agents.id, agentTriggers.agentId))
        .where(and(eq(agentTriggers.id, triggerId), isNull(agents.deletedAt)))
        .limit(1),
    );
    return row?.workspaceId ?? null;
  }
  private async runWorkspace(runId: string): Promise<string | null> {
    return (
      first(
        await this.database.db
          .select({ workspaceId: agentRuns.workspaceId })
          .from(agentRuns)
          .where(eq(agentRuns.id, runId))
          .limit(1),
      )?.workspaceId ?? null
    );
  }
  private async approvalWorkspace(id: string): Promise<string | null> {
    return (
      first(
        await this.database.db
          .select({ workspaceId: approvals.workspaceId })
          .from(approvals)
          .where(eq(approvals.id, id))
          .limit(1),
      )?.workspaceId ?? null
    );
  }
  async listAgents(
    workspaceId: string,
    userId: string,
  ): Promise<Agent[] | null> {
    const role = await this.role(this.database.db, workspaceId, userId);
    if (role === null || !canReadAgents(role)) return null;
    return this.database.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt)))
      .orderBy(desc(agents.createdAt), desc(agents.id));
  }
  async createAgent(
    workspaceId: string,
    userId: string,
    id: string,
    data: CreateAgentData,
  ): Promise<Agent | null> {
    return this.database.db.transaction(async (tx) => {
      const role = await this.role(tx, workspaceId, userId);
      if (role === null || !canMutateAgents(role)) return null;
      return first(
        await tx
          .insert(agents)
          .values({
            id,
            workspaceId,
            name: data.name,
            description: data.description,
            systemPrompt: data.systemPrompt,
            model: data.model,
            approvalPolicy: data.approvalPolicy,
            skillPermissions: data.skills,
          })
          .returning(),
      );
    });
  }
  async getAgent(agentId: string, userId: string): Promise<Agent | null> {
    const row = first(
      await this.database.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
        .limit(1),
    );
    if (
      row === null ||
      !canReadAgents(
        (await this.role(this.database.db, row.workspaceId, userId)) ?? '',
      )
    )
      return null;
    return row;
  }
  async updateAgent(
    agentId: string,
    userId: string,
    data: UpdateAgentData,
  ): Promise<Agent | null> {
    const workspaceId = await this.agentWorkspace(agentId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    const values = {
      ...data,
      ...(data.skills === undefined ? {} : { skillPermissions: data.skills }),
      updatedAt: new Date(),
    };
    delete (values as Partial<CreateAgentData>).skills;
    return first(
      await this.database.db
        .update(agents)
        .set(values)
        .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
        .returning(),
    );
  }
  async setAgentEnabled(
    agentId: string,
    userId: string,
    enabled: boolean,
  ): Promise<Agent | null> {
    return this.updateAgent(agentId, userId, {
      isEnabled: enabled,
    } as UpdateAgentData);
  }
  async duplicateAgent(
    agentId: string,
    userId: string,
    id: string,
  ): Promise<Agent | null> {
    const source = await this.getAgent(agentId, userId);
    if (
      source === null ||
      !canMutateAgents(
        (await this.role(this.database.db, source.workspaceId, userId)) ?? '',
      )
    )
      return null;
    return first(
      await this.database.db
        .insert(agents)
        .values({
          id,
          workspaceId: source.workspaceId,
          name: `${source.name} (Copy)`,
          description: source.description,
          systemPrompt: source.systemPrompt,
          model: source.model,
          approvalPolicy: source.approvalPolicy,
          skillPermissions: source.skillPermissions,
          isEnabled: false,
        })
        .returning(),
    );
  }
  async deleteAgent(agentId: string, userId: string): Promise<boolean> {
    return (
      (await this.updateAgent(agentId, userId, {
        deletedAt: new Date(),
        isEnabled: false,
      } as UpdateAgentData)) !== null
    );
  }
  async listTriggers(
    agentId: string,
    userId: string,
  ): Promise<AgentTrigger[] | null> {
    if ((await this.getAgent(agentId, userId)) === null) return null;
    return this.database.db
      .select()
      .from(agentTriggers)
      .where(eq(agentTriggers.agentId, agentId))
      .orderBy(agentTriggers.createdAt);
  }
  async createTrigger(
    agentId: string,
    userId: string,
    id: string,
    data: TriggerData,
  ): Promise<AgentTrigger | null> {
    const workspaceId = await this.agentWorkspace(agentId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    return first(
      await this.database.db
        .insert(agentTriggers)
        .values({ id, agentId, ...data })
        .returning(),
    );
  }
  async getTrigger(
    triggerId: string,
    userId: string,
  ): Promise<(AgentTrigger & { conditions: TriggerCondition[] }) | null> {
    const trigger = first(
      await this.database.db
        .select()
        .from(agentTriggers)
        .where(eq(agentTriggers.id, triggerId))
        .limit(1),
    );
    if (
      trigger === null ||
      (await this.getAgent(trigger.agentId, userId)) === null
    )
      return null;
    return {
      ...trigger,
      conditions: (await this.database.db
        .select()
        .from(triggerConditions)
        .where(eq(triggerConditions.triggerId, triggerId))
        .orderBy(triggerConditions.createdAt)) as TriggerCondition[],
    };
  }
  async updateTrigger(
    triggerId: string,
    userId: string,
    data: Partial<TriggerData>,
  ): Promise<AgentTrigger | null> {
    const workspaceId = await this.triggerWorkspace(triggerId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    return first(
      await this.database.db
        .update(agentTriggers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentTriggers.id, triggerId))
        .returning(),
    );
  }
  async deleteTrigger(triggerId: string, userId: string): Promise<boolean> {
    const workspaceId = await this.triggerWorkspace(triggerId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return false;
    return (
      (
        await this.database.db
          .delete(agentTriggers)
          .where(eq(agentTriggers.id, triggerId))
          .returning({ id: agentTriggers.id })
      ).length > 0
    );
  }
  async createCondition(
    triggerId: string,
    userId: string,
    id: string,
    data: ConditionData,
  ): Promise<TriggerCondition | null> {
    const workspaceId = await this.triggerWorkspace(triggerId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    return first(
      await this.database.db
        .insert(triggerConditions)
        .values({ id, triggerId, ...data })
        .returning(),
    ) as TriggerCondition | null;
  }
  async deleteCondition(conditionId: string, userId: string): Promise<boolean> {
    const row = first(
      await this.database.db
        .select({ triggerId: triggerConditions.triggerId })
        .from(triggerConditions)
        .where(eq(triggerConditions.id, conditionId))
        .limit(1),
    );
    if (row === null) return false;
    const workspaceId = await this.triggerWorkspace(row.triggerId);
    if (
      workspaceId === null ||
      !canMutateAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return false;
    return (
      (
        await this.database.db
          .delete(triggerConditions)
          .where(eq(triggerConditions.id, conditionId))
          .returning({ id: triggerConditions.id })
      ).length > 0
    );
  }
  async createRun(
    agentId: string,
    userId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<AgentRun | 'disabled' | null> {
    return this.database.db.transaction(async (tx) => {
      const agent = first(
        await tx
          .select()
          .from(agents)
          .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
          .for('update')
          .limit(1),
      );
      if (
        agent === null ||
        !canReadAgents((await this.role(tx, agent.workspaceId, userId)) ?? '')
      )
        return null;
      if (!agent.isEnabled) return 'disabled';
      const run = first(
        await tx
          .insert(agentRuns)
          .values({
            id: runId,
            workspaceId: agent.workspaceId,
            agentId,
            inputContext: input,
            configurationSnapshot: {
              name: agent.name,
              description: agent.description,
              systemPrompt: agent.systemPrompt,
              model: agent.model,
              approvalPolicy: agent.approvalPolicy,
              skillPermissions: agent.skillPermissions,
            },
          })
          .returning(),
      );
      await tx.insert(agentRunLogs).values({
        id: `log_${ulid()}`,
        runId,
        level: 'INFO',
        eventType: 'run.queued',
        message: 'Agent run queued.',
      });
      return run;
    });
  }
  async enqueueRun(runId: string): Promise<void> {
    await this.database.db
      .insert(agentRunJobs)
      .values({ runId })
      .onConflictDoUpdate({
        target: agentRunJobs.runId,
        set: {
          status: 'PENDING',
          availableAt: new Date(),
          claimedAt: null,
          lastError: null,
        },
      });
  }
  async listRuns(
    workspaceId: string,
    userId: string,
    query: RunListQuery,
  ): Promise<Page<AgentRun> | null> {
    if (
      !canReadAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    const filter = and(
      eq(agentRuns.workspaceId, workspaceId),
      query.agentId ? eq(agentRuns.agentId, query.agentId) : undefined,
      query.status ? eq(agentRuns.status, query.status) : undefined,
      query.from ? gte(agentRuns.createdAt, query.from) : undefined,
      query.to ? lte(agentRuns.createdAt, query.to) : undefined,
    );
    const cursor = query.cursor
      ? or(
          lt(agentRuns.createdAt, query.cursor.createdAt),
          and(
            eq(agentRuns.createdAt, query.cursor.createdAt),
            lt(agentRuns.id, query.cursor.id),
          ),
        )
      : undefined;
    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(agentRuns)
        .where(and(filter, cursor))
        .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
        .limit(query.limit + 1),
      this.database.db.select({ value: count() }).from(agentRuns).where(filter),
    ]);
    return {
      items: rows.slice(0, query.limit),
      hasNext: rows.length > query.limit,
      total: totals[0]?.value ?? 0,
    };
  }
  async getRun(runId: string, userId: string): Promise<AgentRun | null> {
    const run = first(
      await this.database.db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, runId))
        .limit(1),
    );
    if (
      run === null ||
      !canReadAgents(
        (await this.role(this.database.db, run.workspaceId, userId)) ?? '',
      )
    )
      return null;
    return run;
  }
  async transitionRun(
    runId: string,
    userId: string,
    from: RunStatus[],
    to: RunStatus,
  ): Promise<AgentRun | null> {
    const workspaceId = await this.runWorkspace(runId);
    if (
      workspaceId === null ||
      !canReadAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    return first(
      await this.database.db
        .update(agentRuns)
        .set({
          status: to,
          updatedAt: new Date(),
          ...([
            'CANCELLED',
            'COMPLETED',
            'FAILED',
            'REJECTED',
            'EXPIRED',
          ].includes(to)
            ? { completedAt: new Date() }
            : {}),
        })
        .where(and(eq(agentRuns.id, runId), inArray(agentRuns.status, from)))
        .returning(),
    );
  }
  async retryRun(
    runId: string,
    userId: string,
    newRunId: string,
  ): Promise<AgentRun | null> {
    const old = await this.getRun(runId, userId);
    if (old === null || old.status !== 'FAILED') return null;
    const run = first(
      await this.database.db
        .insert(agentRuns)
        .values({
          id: newRunId,
          workspaceId: old.workspaceId,
          agentId: old.agentId,
          triggerId: old.triggerId,
          inputContext: old.inputContext,
          configurationSnapshot: old.configurationSnapshot as never,
        })
        .returning(),
    );
    if (run)
      await this.database.db.insert(agentRunLogs).values({
        id: `log_${ulid()}`,
        runId: newRunId,
        level: 'INFO',
        eventType: 'run.retried',
        message: `Retry of ${runId} queued.`,
      });
    return run;
  }
  async listSteps(runId: string, userId: string): Promise<RunStep[] | null> {
    if ((await this.getRun(runId, userId)) === null) return null;
    return this.database.db
      .select()
      .from(agentRunSteps)
      .where(eq(agentRunSteps.runId, runId))
      .orderBy(agentRunSteps.stepNumber);
  }
  async listToolCalls(
    runId: string,
    userId: string,
  ): Promise<ToolCall[] | null> {
    if ((await this.getRun(runId, userId)) === null) return null;
    return this.database.db
      .select()
      .from(agentToolCalls)
      .where(eq(agentToolCalls.runId, runId))
      .orderBy(agentToolCalls.createdAt);
  }
  async listLogs(
    runId: string,
    userId: string,
    after?: { createdAt: Date; id: string },
  ): Promise<RunLog[] | null> {
    if ((await this.getRun(runId, userId)) === null) return null;
    const afterFilter = after
      ? or(
          gt(agentRunLogs.createdAt, after.createdAt),
          and(
            eq(agentRunLogs.createdAt, after.createdAt),
            gt(agentRunLogs.id, after.id),
          ),
        )
      : undefined;
    return this.database.db
      .select()
      .from(agentRunLogs)
      .where(and(eq(agentRunLogs.runId, runId), afterFilter))
      .orderBy(agentRunLogs.createdAt, agentRunLogs.id)
      .limit(500);
  }
  private async expireApprovals(): Promise<void> {
    const now = new Date();
    const expired = await this.database.db
      .update(approvals)
      .set({ status: 'EXPIRED', decidedAt: now })
      .where(
        and(eq(approvals.status, 'PENDING'), lte(approvals.expiresAt, now)),
      )
      .returning({ runId: approvals.runId });
    if (expired.length > 0)
      await this.database.db
        .update(agentRuns)
        .set({ status: 'EXPIRED', completedAt: now, updatedAt: now })
        .where(
          and(
            inArray(
              agentRuns.id,
              expired.map((row) => row.runId),
            ),
            eq(agentRuns.status, 'WAITING_FOR_APPROVAL'),
          ),
        );
  }
  async listApprovals(
    workspaceId: string,
    userId: string,
    query: ApprovalListQuery,
  ): Promise<Approval[] | null> {
    if (
      !canReadAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    await this.expireApprovals();
    return this.database.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, workspaceId),
          query.status ? eq(approvals.status, query.status) : undefined,
        ),
      )
      .orderBy(desc(approvals.createdAt));
  }
  async getApproval(
    approvalId: string,
    userId: string,
  ): Promise<Approval | null> {
    await this.expireApprovals();
    const approval = first(
      await this.database.db
        .select()
        .from(approvals)
        .where(eq(approvals.id, approvalId))
        .limit(1),
    );
    if (
      approval === null ||
      !canReadAgents(
        (await this.role(this.database.db, approval.workspaceId, userId)) ?? '',
      )
    )
      return null;
    return approval;
  }
  async decideApproval(
    approvalId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | null,
  ): Promise<Approval | 'conflict' | null> {
    await this.expireApprovals();
    const workspaceId = await this.approvalWorkspace(approvalId);
    if (
      workspaceId === null ||
      !canReadAgents(
        (await this.role(this.database.db, workspaceId, userId)) ?? '',
      )
    )
      return null;
    return this.database.db.transaction(async (tx) => {
      const approval = first(
        await tx
          .select()
          .from(approvals)
          .where(eq(approvals.id, approvalId))
          .for('update')
          .limit(1),
      );
      if (approval === null) return null;
      if (approval.status !== 'PENDING' || approval.expiresAt <= new Date())
        return 'conflict';
      const updated = first(
        await tx
          .update(approvals)
          .set({
            status: decision,
            decidedBy: userId,
            rejectionReason: decision === 'REJECTED' ? reason : null,
            decidedAt: new Date(),
          })
          .where(eq(approvals.id, approvalId))
          .returning(),
      );
      await tx
        .update(agentRuns)
        .set({
          status: decision === 'APPROVED' ? 'RUNNING' : 'REJECTED',
          updatedAt: new Date(),
          ...(decision === 'REJECTED' ? { completedAt: new Date() } : {}),
        })
        .where(
          and(
            eq(agentRuns.id, approval.runId),
            eq(agentRuns.status, 'WAITING_FOR_APPROVAL'),
          ),
        );
      await tx.insert(agentRunLogs).values({
        id: `log_${ulid()}`,
        runId: approval.runId,
        level: 'INFO',
        eventType: `approval.${decision.toLowerCase()}`,
        message: `Approval ${decision.toLowerCase()}.`,
      });
      return updated;
    });
  }
}

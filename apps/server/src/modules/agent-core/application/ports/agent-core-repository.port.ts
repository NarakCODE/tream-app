import type {
  Agent,
  AgentRun,
  AgentTrigger,
  Approval,
  ApprovalPolicy,
  ApprovalStatus,
  ConditionOperator,
  RunStatus,
  TriggerCondition,
  TriggerType,
} from '../../domain/agent-core';

export const AGENT_CORE_REPOSITORY = Symbol('AGENT_CORE_REPOSITORY');
export const AGENT_RUN_QUEUE = Symbol('AGENT_RUN_QUEUE');
export const AGENT_LLM_GATEWAY = Symbol('AGENT_LLM_GATEWAY');
export const AGENT_SKILL_GATEWAY = Symbol('AGENT_SKILL_GATEWAY');
export const AGENT_EVENT_GATEWAY = Symbol('AGENT_EVENT_GATEWAY');

export interface CreateAgentData {
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  approvalPolicy: ApprovalPolicy;
  skills: string[];
}
export interface UpdateAgentData {
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  model?: string;
  approvalPolicy?: ApprovalPolicy;
  skills?: string[];
}
export interface TriggerData {
  type: TriggerType;
  eventType: string | null;
  cronExpression: string | null;
  integrationId: string | null;
  isEnabled: boolean;
}
export interface ConditionData {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}
export interface RunListQuery {
  agentId?: string;
  status?: RunStatus;
  from?: Date;
  to?: Date;
  cursor?: { createdAt: Date; id: string };
  limit: number;
}
export interface ApprovalListQuery {
  status?: ApprovalStatus;
}
export interface Page<T> {
  items: T[];
  hasNext: boolean;
  total: number;
}
export interface RunStep {
  id: string;
  runId: string;
  stepNumber: number;
  type: string;
  summary: string | null;
  durationMs: number | null;
  createdAt: Date;
}
export interface ToolCall {
  id: string;
  runId: string;
  stepId: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  status: string;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}
export interface RunLog {
  id: string;
  runId: string;
  level: string;
  eventType: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface AgentCoreRepository {
  listAgents(workspaceId: string, userId: string): Promise<Agent[] | null>;
  createAgent(
    workspaceId: string,
    userId: string,
    id: string,
    data: CreateAgentData,
  ): Promise<Agent | null>;
  getAgent(agentId: string, userId: string): Promise<Agent | null>;
  updateAgent(
    agentId: string,
    userId: string,
    data: UpdateAgentData,
  ): Promise<Agent | null>;
  setAgentEnabled(
    agentId: string,
    userId: string,
    enabled: boolean,
  ): Promise<Agent | null>;
  duplicateAgent(
    agentId: string,
    userId: string,
    id: string,
  ): Promise<Agent | null>;
  deleteAgent(agentId: string, userId: string): Promise<boolean>;
  listTriggers(agentId: string, userId: string): Promise<AgentTrigger[] | null>;
  createTrigger(
    agentId: string,
    userId: string,
    id: string,
    data: TriggerData,
  ): Promise<AgentTrigger | null>;
  getTrigger(
    triggerId: string,
    userId: string,
  ): Promise<(AgentTrigger & { conditions: TriggerCondition[] }) | null>;
  updateTrigger(
    triggerId: string,
    userId: string,
    data: Partial<TriggerData>,
  ): Promise<AgentTrigger | null>;
  deleteTrigger(triggerId: string, userId: string): Promise<boolean>;
  createCondition(
    triggerId: string,
    userId: string,
    id: string,
    data: ConditionData,
  ): Promise<TriggerCondition | null>;
  deleteCondition(conditionId: string, userId: string): Promise<boolean>;
  createRun(
    agentId: string,
    userId: string,
    runId: string,
    input: Record<string, unknown>,
  ): Promise<AgentRun | 'disabled' | null>;
  enqueueRun(runId: string): Promise<void>;
  listRuns(
    workspaceId: string,
    userId: string,
    query: RunListQuery,
  ): Promise<Page<AgentRun> | null>;
  getRun(runId: string, userId: string): Promise<AgentRun | null>;
  transitionRun(
    runId: string,
    userId: string,
    from: RunStatus[],
    to: RunStatus,
  ): Promise<AgentRun | null>;
  retryRun(
    runId: string,
    userId: string,
    newRunId: string,
  ): Promise<AgentRun | null>;
  listSteps(runId: string, userId: string): Promise<RunStep[] | null>;
  listToolCalls(runId: string, userId: string): Promise<ToolCall[] | null>;
  listLogs(
    runId: string,
    userId: string,
    after?: { createdAt: Date; id: string },
  ): Promise<RunLog[] | null>;
  listApprovals(
    workspaceId: string,
    userId: string,
    query: ApprovalListQuery,
  ): Promise<Approval[] | null>;
  getApproval(approvalId: string, userId: string): Promise<Approval | null>;
  decideApproval(
    approvalId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | null,
  ): Promise<Approval | 'conflict' | null>;
}

export interface AgentRunQueue {
  enqueue(runId: string): Promise<void>;
}
export interface AgentLlmGateway {
  infer(input: unknown): Promise<unknown>;
}
export interface AgentSkillGateway {
  execute(skill: string, input: unknown): Promise<unknown>;
}
export interface AgentEventGateway {
  publish(type: string, payload: unknown): Promise<void>;
}

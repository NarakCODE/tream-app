export const APPROVAL_POLICIES = [
  'NONE',
  'EXTERNAL_ACTIONS',
  'EVERY_WRITE',
  'ALWAYS',
] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];
export const TRIGGER_TYPES = ['EVENT', 'SCHEDULE'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];
export const RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const APPROVAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'not_starts_with',
  'ends_with',
  'not_ends_with',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
  'not_exists',
  'in',
  'not_in',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  approvalPolicy: ApprovalPolicy;
  skillPermissions: string[];
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
export interface AgentTrigger {
  id: string;
  agentId: string;
  type: TriggerType;
  eventType: string | null;
  cronExpression: string | null;
  integrationId: string | null;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface TriggerCondition {
  id: string;
  triggerId: string;
  field: string;
  operator: ConditionOperator;
  value: unknown;
  createdAt: Date;
}
export interface AgentRun {
  id: string;
  workspaceId: string;
  agentId: string;
  triggerId: string | null;
  status: RunStatus;
  inputContext: Record<string, unknown>;
  configurationSnapshot: {
    name: string;
    description: string | null;
    systemPrompt: string;
    model: string;
    approvalPolicy: ApprovalPolicy;
    skillPermissions: string[];
  };
  outputSummary: string | null;
  failureCode: string | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface Approval {
  id: string;
  workspaceId: string;
  runId: string;
  stepId: string | null;
  actionType: string;
  toolName: string;
  input: unknown;
  diff: unknown;
  status: ApprovalStatus;
  decidedBy: string | null;
  rejectionReason: string | null;
  decidedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export const BUILT_IN_SKILLS = [
  'database.read',
  'database.create_record',
  'database.update_record',
  'contacts.search',
  'contacts.create',
  'contacts.update',
  'companies.search',
  'mail.search',
  'mail.read_thread',
  'mail.create_draft',
  'mail.send',
  'tasks.create',
  'tasks.update',
] as const;

export const canMutateAgents = (role: string): boolean =>
  role === 'OWNER' || role === 'ADMIN';
export const canReadAgents = (role: string): boolean =>
  ['OWNER', 'ADMIN', 'MEMBER'].includes(role);
export const isSkillAllowed = (
  agent: Pick<Agent, 'skillPermissions'>,
  skill: string,
): boolean => agent.skillPermissions.includes(skill);
export const needsApproval = (
  policy: ApprovalPolicy,
  action: { isWrite: boolean; isExternal: boolean },
): boolean =>
  policy === 'ALWAYS' ||
  (policy === 'EVERY_WRITE' && action.isWrite) ||
  (policy === 'EXTERNAL_ACTIONS' && action.isExternal);

const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_APPROVAL: ['RUNNING', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  COMPLETED: [],
  FAILED: ['QUEUED'],
  CANCELLED: [],
  REJECTED: ['CANCELLED'],
  EXPIRED: [],
};
export const canTransitionRun = (from: RunStatus, to: RunStatus): boolean =>
  RUN_TRANSITIONS[from].includes(to);

const valueAt = (input: Record<string, unknown>, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      input,
    );
const comparable = (value: unknown): string | number | null =>
  typeof value === 'number' || typeof value === 'string' ? value : null;
export const evaluateCondition = (
  condition: Pick<TriggerCondition, 'field' | 'operator' | 'value'>,
  payload: Record<string, unknown>,
): boolean => {
  const actual = valueAt(payload, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'contains':
      return typeof actual === 'string'
        ? actual.includes(String(expected))
        : Array.isArray(actual) && actual.includes(expected);
    case 'not_contains':
      return !evaluateCondition(
        { ...condition, operator: 'contains' },
        payload,
      );
    case 'starts_with':
      return typeof actual === 'string' && actual.startsWith(String(expected));
    case 'not_starts_with':
      return !evaluateCondition(
        { ...condition, operator: 'starts_with' },
        payload,
      );
    case 'ends_with':
      return typeof actual === 'string' && actual.endsWith(String(expected));
    case 'not_ends_with':
      return !evaluateCondition(
        { ...condition, operator: 'ends_with' },
        payload,
      );
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const left = comparable(actual);
      const right = comparable(expected);
      if (left === null || right === null || typeof left !== typeof right)
        return false;
      if (condition.operator === 'gt') return left > right;
      if (condition.operator === 'gte') return left >= right;
      if (condition.operator === 'lt') return left < right;
      return left <= right;
    }
  }
};

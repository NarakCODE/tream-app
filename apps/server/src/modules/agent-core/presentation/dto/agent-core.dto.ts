import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationQueryDto } from '../../../../common/dto/cursor-pagination-query.dto';
import {
  APPROVAL_POLICIES,
  APPROVAL_STATUSES,
  BUILT_IN_SKILLS,
  CONDITION_OPERATORS,
  RUN_STATUSES,
  TRIGGER_TYPES,
  type Agent,
  type AgentRun,
  type AgentTrigger,
  type Approval,
  type ApprovalPolicy,
  type ApprovalStatus,
  type ConditionOperator,
  type RunStatus,
  type TriggerCondition,
  type TriggerType,
} from '../../domain/agent-core';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const id = (prefix: string): RegExp =>
  new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`);
export class AgentIdParamDto {
  @Matches(id('agt')) agentId!: string;
}
export class TriggerIdParamDto {
  @Matches(id('trg')) triggerId!: string;
}
export class ConditionIdParamDto {
  @Matches(id('cnd')) conditionId!: string;
}
export class RunIdParamDto {
  @Matches(id('run')) runId!: string;
}
export class ApprovalIdParamDto {
  @Matches(id('app')) approvalId!: string;
}

export class CreateAgentDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2_000) description?:
    string | null;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  systemPrompt!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) model = 'gpt-4o';
  @IsOptional() @IsIn(APPROVAL_POLICIES) approvalPolicy: ApprovalPolicy =
    'EXTERNAL_ACTIONS';
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(BUILT_IN_SKILLS.length)
  @IsIn(BUILT_IN_SKILLS, { each: true })
  skills!: string[];
}
export class UpdateAgentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2_000) description?:
    string | null;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  systemPrompt?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model?: string;
  @IsOptional() @IsIn(APPROVAL_POLICIES) approvalPolicy?: ApprovalPolicy;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(BUILT_IN_SKILLS.length)
  @IsIn(BUILT_IN_SKILLS, { each: true })
  skills?: string[];
}
export class TriggerDto {
  @IsIn(TRIGGER_TYPES) type!: TriggerType;
  @ValidateIf((o: TriggerDto) => o.type === 'EVENT')
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventType?: string;
  @ValidateIf((o: TriggerDto) => o.type === 'SCHEDULE')
  @Transform(trim)
  @IsString()
  @Matches(/^(\S+\s+){4}\S+$/)
  cronExpression?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) integrationId?:
    string | null;
  @IsOptional() @IsBoolean() isEnabled = true;
}
export class UpdateTriggerDto {
  @IsOptional() @IsIn(TRIGGER_TYPES) type?: TriggerType;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventType?: string | null;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^(\S+\s+){4}\S+$/)
  cronExpression?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) integrationId?:
    string | null;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
}
export class ConditionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_.-]+$/)
  @MaxLength(200)
  field!: string;
  @IsIn(CONDITION_OPERATORS) operator!: ConditionOperator;
  @Allow()
  value!: unknown;
}
export class ManualRunDto {
  @IsOptional() @IsObject() inputContext: Record<string, unknown> = {};
}
export class ListRunsQueryDto extends CursorPaginationQueryDto {
  @IsOptional() @Matches(id('agt')) agentId?: string;
  @IsOptional() @IsIn(RUN_STATUSES) status?: RunStatus;
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;
  @IsOptional() @IsISO8601({ strict: true, strictSeparator: true }) to?: string;
}
export class ListApprovalsQueryDto {
  @IsOptional() @IsIn(APPROVAL_STATUSES) status?: ApprovalStatus;
}
export class RejectApprovalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  reason?: string;
}

export class AgentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() systemPrompt!: string;
  @ApiProperty() model!: string;
  @ApiProperty({ enum: APPROVAL_POLICIES }) approvalPolicy!: ApprovalPolicy;
  @ApiProperty({ isArray: true, enum: BUILT_IN_SKILLS })
  skillPermissions!: string[];
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  static from(this: void, value: Agent): AgentResponseDto {
    return {
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
      deletedAt: value.deletedAt?.toISOString() ?? null,
    } as AgentResponseDto;
  }
}
export class TriggerResponseDto {
  id!: string;
  agentId!: string;
  type!: TriggerType;
  eventType!: string | null;
  cronExpression!: string | null;
  integrationId!: string | null;
  isEnabled!: boolean;
  createdAt!: string;
  updatedAt!: string;
  conditions?: TriggerCondition[];
  static from(
    this: void,
    value: AgentTrigger & { conditions?: TriggerCondition[] },
  ): TriggerResponseDto {
    return {
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
export class ConditionResponseDto {
  id!: string;
  triggerId!: string;
  field!: string;
  operator!: ConditionOperator;
  value!: unknown;
  createdAt!: string;
  static from(this: void, value: TriggerCondition): ConditionResponseDto {
    return { ...value, createdAt: value.createdAt.toISOString() };
  }
}
export class RunResponseDto {
  id!: string;
  workspaceId!: string;
  agentId!: string;
  triggerId!: string | null;
  status!: RunStatus;
  inputContext!: Record<string, unknown>;
  configurationSnapshot!: AgentRun['configurationSnapshot'];
  outputSummary!: string | null;
  failureCode!: string | null;
  tokenUsage!: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  startedAt!: string | null;
  completedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  static from(this: void, value: AgentRun): RunResponseDto {
    return {
      ...value,
      startedAt: value.startedAt?.toISOString() ?? null,
      completedAt: value.completedAt?.toISOString() ?? null,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
export class ApprovalResponseDto {
  id!: string;
  workspaceId!: string;
  runId!: string;
  stepId!: string | null;
  actionType!: string;
  toolName!: string;
  input!: unknown;
  diff!: unknown;
  status!: ApprovalStatus;
  decidedBy!: string | null;
  rejectionReason!: string | null;
  decidedAt!: string | null;
  expiresAt!: string;
  createdAt!: string;
  static from(this: void, value: Approval): ApprovalResponseDto {
    return {
      ...value,
      decidedAt: value.decidedAt?.toISOString() ?? null,
      expiresAt: value.expiresAt.toISOString(),
      createdAt: value.createdAt.toISOString(),
    };
  }
}

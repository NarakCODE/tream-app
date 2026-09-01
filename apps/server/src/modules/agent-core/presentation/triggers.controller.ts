import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { AgentCoreService } from '../application/agent-core.service';
import {
  AgentIdParamDto,
  ConditionIdParamDto,
  ConditionDto,
  ConditionResponseDto,
  TriggerDto,
  TriggerIdParamDto,
  TriggerResponseDto,
  UpdateTriggerDto,
} from './dto/agent-core.dto';

@ApiTags('Agent Triggers')
@ApiBearerAuth()
@Controller({ path: 'agents/:agentId/triggers', version: '1' })
export class AgentTriggersController {
  constructor(private readonly service: AgentCoreService) {}
  @Get() @ApiStandardArrayResponse(TriggerResponseDto) async list(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<TriggerResponseDto[]> {
    return (await this.service.listTriggers(p.agentId, u.id)).map(
      TriggerResponseDto.from,
    );
  }
  @Post()
  @ApiStandardResponse(TriggerResponseDto, HttpStatus.CREATED)
  async create(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: TriggerDto,
  ): Promise<TriggerResponseDto> {
    return TriggerResponseDto.from(
      await this.service.createTrigger(p.agentId, u.id, {
        type: dto.type,
        eventType: dto.type === 'EVENT' ? (dto.eventType ?? null) : null,
        cronExpression:
          dto.type === 'SCHEDULE' ? (dto.cronExpression ?? null) : null,
        integrationId: dto.integrationId ?? null,
        isEnabled: dto.isEnabled,
      }),
    );
  }
}

@ApiTags('Agent Triggers')
@ApiBearerAuth()
@Controller({ path: 'agent-triggers', version: '1' })
export class TriggersController {
  constructor(private readonly service: AgentCoreService) {}
  @Get(':triggerId') @ApiStandardResponse(TriggerResponseDto) async get(
    @Param() p: TriggerIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<TriggerResponseDto> {
    return TriggerResponseDto.from(
      await this.service.getTrigger(p.triggerId, u.id),
    );
  }
  @Patch(':triggerId') @ApiStandardResponse(TriggerResponseDto) async update(
    @Param() p: TriggerIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: UpdateTriggerDto,
  ): Promise<TriggerResponseDto> {
    return TriggerResponseDto.from(
      await this.service.updateTrigger(p.triggerId, u.id, dto),
    );
  }
  @Delete(':triggerId') @HttpCode(204) @ApiNoContentResponse() async delete(
    @Param() p: TriggerIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteTrigger(p.triggerId, u.id);
  }
  @Post(':triggerId/conditions')
  @ApiStandardResponse(ConditionResponseDto, HttpStatus.CREATED)
  async condition(
    @Param() p: TriggerIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: ConditionDto,
  ): Promise<ConditionResponseDto> {
    return ConditionResponseDto.from(
      await this.service.createCondition(p.triggerId, u.id, dto),
    );
  }
}

@ApiTags('Agent Triggers')
@ApiBearerAuth()
@Controller({ path: 'trigger-conditions', version: '1' })
export class ConditionsController {
  constructor(private readonly service: AgentCoreService) {}
  @Delete(':conditionId') @HttpCode(204) @ApiNoContentResponse() async delete(
    @Param() p: ConditionIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteCondition(p.conditionId, u.id);
  }
}

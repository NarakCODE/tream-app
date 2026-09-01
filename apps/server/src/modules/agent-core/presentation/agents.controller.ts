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
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { AgentCoreService } from '../application/agent-core.service';
import {
  AgentIdParamDto,
  AgentResponseDto,
  ManualRunDto,
  RunResponseDto,
  UpdateAgentDto,
} from './dto/agent-core.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(private readonly service: AgentCoreService) {}
  @Get(':agentId') @ApiStandardResponse(AgentResponseDto) async get(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(await this.service.getAgent(p.agentId, u.id));
  }
  @Patch(':agentId') @ApiStandardResponse(AgentResponseDto) async update(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: UpdateAgentDto,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(
      await this.service.updateAgent(p.agentId, u.id, dto),
    );
  }
  @Delete(':agentId') @HttpCode(204) @ApiNoContentResponse() async delete(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteAgent(p.agentId, u.id);
  }
  @Post(':agentId/enable')
  @HttpCode(200)
  @ApiStandardResponse(AgentResponseDto)
  async enable(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(
      await this.service.setEnabled(p.agentId, u.id, true),
    );
  }
  @Post(':agentId/disable')
  @HttpCode(200)
  @ApiStandardResponse(AgentResponseDto)
  async disable(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(
      await this.service.setEnabled(p.agentId, u.id, false),
    );
  }
  @Post(':agentId/duplicate')
  @ApiStandardResponse(AgentResponseDto, HttpStatus.CREATED)
  async duplicate(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<AgentResponseDto> {
    return AgentResponseDto.from(await this.service.duplicate(p.agentId, u.id));
  }
  @Post(':agentId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiStandardResponse(RunResponseDto, HttpStatus.ACCEPTED)
  async run(
    @Param() p: AgentIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: ManualRunDto,
  ): Promise<RunResponseDto> {
    return RunResponseDto.from(
      await this.service.run(p.agentId, u.id, dto.inputContext),
    );
  }
}

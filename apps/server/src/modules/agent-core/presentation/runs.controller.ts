import { Controller, Get, HttpCode, Param, Post, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { concatMap, filter, from, map, type Observable, timer } from 'rxjs';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { AgentCoreService } from '../application/agent-core.service';
import type {
  RunLog,
  RunStep,
  ToolCall,
} from '../application/ports/agent-core-repository.port';
import { RunIdParamDto, RunResponseDto } from './dto/agent-core.dto';

interface SseMessage {
  id?: string;
  type?: string;
  data: string;
}
class RunStepResponseDto {}
class ToolCallResponseDto {}
class RunLogResponseDto {}
@ApiTags('Agent Runs')
@ApiBearerAuth()
@Controller({ path: 'agent-runs', version: '1' })
export class RunsController {
  constructor(private readonly service: AgentCoreService) {}
  @Get(':runId') @ApiStandardResponse(RunResponseDto) async get(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<RunResponseDto> {
    return RunResponseDto.from(await this.service.getRun(p.runId, u.id));
  }
  @Post(':runId/cancel')
  @HttpCode(200)
  @ApiStandardResponse(RunResponseDto)
  async cancel(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<RunResponseDto> {
    return RunResponseDto.from(await this.service.cancelRun(p.runId, u.id));
  }
  @Post(':runId/retry')
  @HttpCode(202)
  @ApiStandardResponse(RunResponseDto, 202)
  async retry(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<RunResponseDto> {
    return RunResponseDto.from(await this.service.retryRun(p.runId, u.id));
  }
  @Get(':runId/steps')
  @ApiStandardArrayResponse(RunStepResponseDto)
  async steps(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<RunStep[]> {
    return this.service.listSteps(p.runId, u.id);
  }
  @Get(':runId/tool-calls')
  @ApiStandardArrayResponse(ToolCallResponseDto)
  async tools(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<ToolCall[]> {
    return this.service.listToolCalls(p.runId, u.id);
  }
  @Get(':runId/logs') @ApiStandardArrayResponse(RunLogResponseDto) async logs(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<RunLog[]> {
    return this.service.listLogs(p.runId, u.id);
  }
  @Sse(':runId/stream') stream(
    @Param() p: RunIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Observable<SseMessage> {
    let cursor: { createdAt: Date; id: string } | undefined;
    return timer(0, 1_000).pipe(
      concatMap(() => from(this.service.listLogsAfter(p.runId, u.id, cursor))),
      concatMap((logs) => from(logs)),
      map((log) => {
        cursor = { createdAt: log.createdAt, id: log.id };
        return {
          id: log.id,
          type: log.eventType,
          data: JSON.stringify({
            message: log.message,
            level: log.level,
            data: log.data,
            createdAt: log.createdAt.toISOString(),
          }),
        };
      }),
      filter((message) => message.id !== undefined),
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { CycleService } from '../application/cycle.service';
import {
  CompleteCycleDto,
  CreateCycleDto,
  CycleListDto,
  CycleRevisionDto,
  ScheduleCyclesDto,
  UpdateCycleDto,
} from './cycle.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Cycles')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/teams/:teamId/cycles')
export class CyclesController {
  constructor(private readonly service: CycleService) {}
  @Get() list(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Query() query: CycleListDto,
  ) {
    return this.service.list(
      req.user.id,
      workspaceId,
      teamId,
      query.limit,
      query.cursor,
    );
  }
  @Post() @TransactionalCommand() create(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateCycleDto,
  ) {
    return this.service.create(req.commandIdentity, workspaceId, teamId, dto);
  }
  @Post('schedule') @TransactionalCommand() schedule(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Body() dto: ScheduleCyclesDto,
  ) {
    return this.service.schedule(req.commandIdentity, workspaceId, teamId, dto);
  }
  @Get(':cycleId') get(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
  ) {
    return this.service.get(req.user.id, workspaceId, teamId, cycleId);
  }
  @Get(':cycleId/report') report(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
  ) {
    return this.service.report(req.user.id, workspaceId, teamId, cycleId);
  }
  @Patch(':cycleId') @TransactionalCommand() update(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: UpdateCycleDto,
  ) {
    return this.service.update(
      req.commandIdentity,
      workspaceId,
      teamId,
      cycleId,
      dto,
    );
  }
  @Post(':cycleId/start')
  @HttpCode(200)
  @TransactionalCommand()
  start(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: CycleRevisionDto,
  ) {
    return this.service.start(
      req.commandIdentity,
      workspaceId,
      teamId,
      cycleId,
      dto.expectedRevision,
    );
  }
  @Post(':cycleId/complete')
  @HttpCode(200)
  @TransactionalCommand()
  complete(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: CompleteCycleDto,
  ) {
    return this.service.complete(
      req.commandIdentity,
      workspaceId,
      teamId,
      cycleId,
      dto,
    );
  }
  @Delete(':cycleId') @TransactionalCommand() cancel(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('teamId') teamId: string,
    @Param('cycleId') cycleId: string,
    @Body() dto: CycleRevisionDto,
  ) {
    return this.service.cancel(
      req.commandIdentity,
      workspaceId,
      teamId,
      cycleId,
      dto.expectedRevision,
    );
  }
}

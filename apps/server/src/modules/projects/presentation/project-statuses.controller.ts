import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
import { ProjectStatusService } from '../application/project-status.service';
import {
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
  ReorderProjectStatusesDto,
  RetireProjectStatusDto,
} from './project.dto';
@ApiTags('Project statuses')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/project-statuses')
export class ProjectStatusesController {
  constructor(private readonly service: ProjectStatusService) {}
  @Get('') list(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.service.list(req.user.id, workspaceId);
  }
  @Post('') @TransactionalCommand() create(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateProjectStatusDto,
  ) {
    return this.service.create(req.commandIdentity, workspaceId, dto);
  }
  @Post('reorder') @TransactionalCommand() reorder(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ReorderProjectStatusesDto,
  ) {
    return this.service.reorder(
      req.commandIdentity,
      workspaceId,
      dto.statusIds,
    );
  }
  @Patch(':statusId') @TransactionalCommand() update(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.service.update(req.commandIdentity, workspaceId, statusId, dto);
  }
  @Post(':statusId/default') @TransactionalCommand() setDefault(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
  ) {
    return this.service.setDefault(req.commandIdentity, workspaceId, statusId);
  }
  @Delete(':statusId') @TransactionalCommand() retire(
    @Req() req: Request,
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @Body() dto: RetireProjectStatusDto,
  ) {
    return this.service.retire(
      req.commandIdentity,
      workspaceId,
      statusId,
      dto?.replacementStatusId,
    );
  }
}

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
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
import { DocumentService } from '../application/document.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentRevisionDto,
  DocumentListDto,
} from './document.dto';
@ApiTags('Documents')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/documents')
export class DocumentsController {
  constructor(private readonly service: DocumentService) {}
  @Get() list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: DocumentListDto,
  ) {
    return this.service.list(r.user.id, w, q);
  }
  @Post() @TransactionalCommand() create(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: CreateDocumentDto,
  ) {
    return this.service.create(r.commandIdentity, w, d);
  }
  @Get(':id') get(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.get(r.user.id, w, id);
  }
  @Patch(':id') @TransactionalCommand() update(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: UpdateDocumentDto,
  ) {
    return this.service.update(r.commandIdentity, w, id, d);
  }
  @Delete(':id') @HttpCode(200) @TransactionalCommand() deleted(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: DocumentRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'deleted',
    );
  }
  @Post(':id/archive') @HttpCode(200) @TransactionalCommand() archived(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: DocumentRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'archived',
    );
  }
  @Post(':id/restore') @HttpCode(200) @TransactionalCommand() restored(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: DocumentRevisionDto,
  ) {
    return this.service.lifecycle(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      'restored',
    );
  }
}

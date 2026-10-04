import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedPrincipal } from '../../../common/auth/principal';
import type { IdempotencyReservationInput } from '../../../common/idempotency/idempotency.types';
import { TransactionalCommand } from '../../../common/decorators/transactional-command.decorator';
import { contentDisposition } from '../domain/file-content-policy';
import { FileService } from '../application/file.service';
import {
  UploadIntentDto,
  FileRevisionDto,
  FinalizeFileDto,
  DownloadGrantDto,
  AttachmentDto,
  AttachmentListDto,
  FileReadDto,
  FileGrantQueryDto,
} from './file.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
  body: Buffer;
}
@ApiTags('Files')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class FilesController {
  constructor(private readonly service: FileService) {}
  @Post('files/upload-intents') @TransactionalCommand() intent(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: UploadIntentDto,
  ) {
    return this.service.intent(r.commandIdentity, r.user, w, d);
  }
  @Post('files/:fileId/upload-grants') @TransactionalCommand() uploadGrant(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Body() d: FileRevisionDto,
  ) {
    return this.service.uploadGrant(
      r.commandIdentity,
      r.user,
      w,
      id,
      d.expectedRevision,
    );
  }
  @Put('files/:fileId/content')
  @HttpCode(200)
  @ApiConsumes('application/octet-stream')
  upload(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Query() q: FileGrantQueryDto,
  ) {
    return this.service.upload(r.user, w, id, q.grant, r.body);
  }
  @Post('files/:fileId/finalize')
  @HttpCode(200)
  @TransactionalCommand()
  finalize(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Body() d: FinalizeFileDto,
  ) {
    return this.service.finalize(r.commandIdentity, w, id, d);
  }
  @Get('files/:fileId') get(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Query() q: FileReadDto,
  ) {
    return this.service.get(r.user.id, w, id, q.attachmentId);
  }
  @Post('files/:fileId/download-grants') @TransactionalCommand() downloadGrant(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Body() d: DownloadGrantDto,
  ) {
    return this.service.downloadGrant(
      r.commandIdentity,
      r.user,
      w,
      id,
      d.attachmentId,
    );
  }
  @Get('files/:fileId/content') async download(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Query() q: FileGrantQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const content = await this.service.download(r.user, w, id, q.grant);
    return reply
      .header('Content-Type', content.mimeType)
      .header('Content-Disposition', contentDisposition(content.name))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Length', content.bytes.length)
      .send(content.bytes);
  }
  @Delete('files/:fileId') @TransactionalCommand() delete(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Body() d: FileRevisionDto,
  ) {
    return this.service.delete(r.commandIdentity, w, id, d.expectedRevision);
  }
  @Post('files/:fileId/restore') @HttpCode(200) @TransactionalCommand() restore(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('fileId') id: string,
    @Body() d: FileRevisionDto,
  ) {
    return this.service.restore(r.commandIdentity, w, id, d.expectedRevision);
  }
  @Get('file-attachments') list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: AttachmentListDto,
  ) {
    return this.service.list(r.user.id, w, q, q.limit, q.cursor);
  }
  @Post('file-attachments') @TransactionalCommand() attach(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: AttachmentDto,
  ) {
    return this.service.attach(r.commandIdentity, w, d);
  }
  @Delete('file-attachments/:attachmentId') @TransactionalCommand() detach(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('attachmentId') id: string,
    @Body() d: FileRevisionDto,
  ) {
    return this.service.detach(r.commandIdentity, w, id, d.expectedRevision);
  }
}

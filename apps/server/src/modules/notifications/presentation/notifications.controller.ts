import {
  Body,
  Controller,
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
import { NotificationService } from '../application/notification.service';
import {
  NotificationListDto,
  NotificationReadDto,
  NotificationArchiveDto,
  NotificationSnoozeDto,
  NotificationPreferencesDto,
  RetryDeliveryDto,
} from './notification.dto';
interface Request {
  user: AuthenticatedPrincipal;
  commandIdentity: IdempotencyReservationInput;
}
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationService) {}
  @Get() list(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Query() q: NotificationListDto,
  ) {
    return this.service.list(r.user.id, w, q);
  }
  @Get('unread-count') unread(
    @Req() r: Request,
    @Param('workspaceId') w: string,
  ) {
    return this.service.unread(r.user.id, w);
  }
  @Get('preferences') prefs(
    @Req() r: Request,
    @Param('workspaceId') w: string,
  ) {
    return this.service.preferences(r.user.id, w);
  }
  @Patch('preferences') @TransactionalCommand() updatePrefs(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Body() d: NotificationPreferencesDto,
  ) {
    return this.service.updatePreferences(r.commandIdentity, w, d);
  }
  @Get(':id') get(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.get(r.user.id, w, id);
  }
  @Patch(':id/read') @TransactionalCommand() read(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: NotificationReadDto,
  ) {
    return this.service.change(r.commandIdentity, w, id, d.expectedRevision, {
      readAt: d.read ? new Date() : null,
    });
  }
  @Patch(':id/archive') @TransactionalCommand() archive(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: NotificationArchiveDto,
  ) {
    return this.service.change(r.commandIdentity, w, id, d.expectedRevision, {
      archivedAt: d.archived ? new Date() : null,
    });
  }
  @Patch(':id/snooze') @TransactionalCommand() snooze(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: NotificationSnoozeDto,
  ) {
    return this.service.snooze(
      r.commandIdentity,
      w,
      id,
      d.expectedRevision,
      d.snoozedUntil,
    );
  }
  @Get(':id/deliveries') deliveries(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
  ) {
    return this.service.deliveries(r.user.id, w, id);
  }
  @Post(':id/deliveries/retry') @HttpCode(200) @TransactionalCommand() retry(
    @Req() r: Request,
    @Param('workspaceId') w: string,
    @Param('id') id: string,
    @Body() d: RetryDeliveryDto,
  ) {
    return this.service.retryDelivery(
      r.commandIdentity,
      w,
      id,
      d.acknowledgePossibleDuplicate,
    );
  }
}

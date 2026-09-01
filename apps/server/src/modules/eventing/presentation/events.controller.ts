import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { EventAccess } from '../application/ports/event-store.port';
import { EventingService } from '../application/eventing.service';
import { EventAccessGuard } from '../infrastructure/event-access.guard';
import { CurrentEventAccess } from './decorators/current-event-access.decorator';
import { EventAccessMode } from './decorators/event-access.decorator';
import {
  EventDispatchResponseDto,
  EventIdParamDto,
  EventResponseDto,
} from './dto/event.dto';

@ApiTags('Events')
@ApiBearerAuth()
@Controller({ path: 'events', version: '1' })
@UseGuards(EventAccessGuard)
export class EventsController {
  constructor(private readonly eventingService: EventingService) {}

  @Get(':eventId')
  @ApiOperation({ summary: 'Get event payload details' })
  @ApiStandardResponse(EventResponseDto)
  get(
    @Param() _params: EventIdParamDto,
    @CurrentEventAccess() access: EventAccess,
  ): EventResponseDto {
    return EventResponseDto.fromEntity(access.event);
  }

  @Post(':eventId/reprocess')
  @EventAccessMode('reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an event for trigger re-evaluation' })
  @ApiStandardResponse(EventDispatchResponseDto, HttpStatus.ACCEPTED)
  async reprocess(
    @Param() params: EventIdParamDto,
  ): Promise<EventDispatchResponseDto> {
    return EventDispatchResponseDto.fromEntity(
      await this.eventingService.reprocess(params.eventId),
    );
  }
}

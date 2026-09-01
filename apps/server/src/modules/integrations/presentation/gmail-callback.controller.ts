import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { IntegrationsService } from '../application/integrations.service';
import {
  GmailCallbackQueryDto,
  IntegrationResponseDto,
} from './dto/integration.dto';

@ApiTags('Integrations')
@Controller({ path: 'integrations/gmail/callback', version: '1' })
export class GmailCallbackController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Complete a Gmail OAuth connection' })
  @ApiStandardResponse(IntegrationResponseDto)
  async callback(
    @Query() query: GmailCallbackQueryDto,
  ): Promise<IntegrationResponseDto> {
    return IntegrationResponseDto.fromEntity(
      await this.integrations.callback(query.state, query.code),
    );
  }
}

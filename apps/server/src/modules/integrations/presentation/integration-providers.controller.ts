import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { IntegrationsService } from '../application/integrations.service';
import { IntegrationProviderListDto } from './dto/integration.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller({ path: 'integration-providers', version: '1' })
export class IntegrationProvidersController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List supported integration providers' })
  @ApiStandardResponse(IntegrationProviderListDto)
  list(): IntegrationProviderListDto {
    return { providers: [...this.integrations.providers()] };
  }
}

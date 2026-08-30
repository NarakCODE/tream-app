import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipResponseTransform } from '../../common/decorators/skip-transform.decorator';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @SkipResponseTransform()
  @ApiOperation({ summary: 'Return service liveness' })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

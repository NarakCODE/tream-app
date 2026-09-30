import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipResponseTransform } from '../../common/decorators/skip-transform.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DatabaseService } from '../../database/database.service';

@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('ready')
  @SkipResponseTransform()
  @ApiOperation({ summary: 'Return PostgreSQL readiness' })
  async getReadiness(): Promise<{ status: 'ready' }> {
    try {
      await this.database.checkReadiness();
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }
    return { status: 'ready' };
  }

  @Get()
  @SkipResponseTransform()
  @ApiOperation({ summary: 'Return service liveness' })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

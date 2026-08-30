import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApplication } from './application.factory';
import type { ApplicationConfiguration } from './config/configuration.interface';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get(ConfigService<ApplicationConfiguration, true>);
  const port = config.getOrThrow('app.port', { infer: true });

  await app.listen({ port, host: '0.0.0.0' });
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();

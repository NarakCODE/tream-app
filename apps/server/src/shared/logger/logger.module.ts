import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { ApplicationConfiguration } from '../../config/configuration.interface';
import { AppLoggerService } from './logger.service';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction =
          config.getOrThrow<ApplicationConfiguration['app']['nodeEnv']>(
            'app.nodeEnv',
          ) === 'production';
        const baseOptions = {
          level: isProduction ? 'info' : 'debug',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.token',
              'req.body.secret',
            ],
            remove: true,
          },
        };

        const isDevelopment =
          config.getOrThrow<ApplicationConfiguration['app']['nodeEnv']>(
            'app.nodeEnv',
          ) === 'development';

        return isDevelopment
          ? {
              pinoHttp: {
                ...baseOptions,
                transport: {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
              },
            }
          : { pinoHttp: baseOptions };
      },
    }),
  ],
  providers: [AppLoggerService],
  exports: [AppLoggerService, PinoLoggerModule],
})
export class LoggerModule {}

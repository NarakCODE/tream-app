import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingHttpHeaders } from 'node:http';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import {
  RequestContextService,
  createRequestId,
} from './common/context/request-context.service';
import type { ApplicationConfiguration } from './config/configuration.interface';

const getRequestHeader = (request: {
  headers: IncomingHttpHeaders;
}): string | undefined => {
  const value = request.headers['x-request-id'];
  return Array.isArray(value) ? value[0] : value;
};

const configureSwagger = (app: NestFastifyApplication): void => {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Tream API')
      .setDescription('Production-ready modular API scaffold.')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
};

export const createApplication = async (): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      requestIdHeader: 'x-request-id',
      genReqId: (request: { headers: IncomingHttpHeaders }) =>
        createRequestId(getRequestHeader(request)),
    }),
    { bufferLogs: true },
  );
  const config = app.get(ConfigService<ApplicationConfiguration, true>);
  const requestContext = app.get(RequestContextService);
  const logger = app.get(PinoNestLogger);

  app.useLogger(logger);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.ALL }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.register(cors, {
    origin: config.getOrThrow('app.corsOrigin', { infer: true }).split(','),
    credentials: true,
  });

  if (config.getOrThrow('app.swaggerEnabled', { infer: true })) {
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        },
      },
    });
    configureSwagger(app);
  } else {
    await app.register(helmet);
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      requestContext.enter(request.id);
      reply.header('x-request-id', request.id);
      logger.log(
        {
          requestId: request.id,
          method: request.method,
          path: request.url,
          ip: request.ip,
        },
        'request started',
      );
      done();
    });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
};

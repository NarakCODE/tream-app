import type {
  ApplicationConfiguration,
  NodeEnvironment,
} from './configuration.interface';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value.toLowerCase() === 'true';

export const appConfig = (): ApplicationConfiguration => ({
  app: {
    nodeEnv: (process.env.NODE_ENV ?? 'development') as NodeEnvironment,
    port: Number.parseInt(process.env.PORT ?? '3002', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    swaggerEnabled: parseBoolean(process.env.SWAGGER_ENABLED, true),
  },
});

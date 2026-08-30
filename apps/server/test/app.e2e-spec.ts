import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../src/application.factory';

describe('Application (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    app = await createApplication();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the unwrapped health endpoint with a correlation id', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });
});

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
  it.each(['/api/v1/me', '/api/v1/workspaces'])(
    'requires authentication for %s',
    async (url) => {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
    },
  );
  it.each([
    ['GET', '/api/v1/workspaces/wsp_demo/teams'],
    ['GET', '/api/v1/workspaces/wsp_demo/projects'],
    ['GET', '/api/v1/workspaces/wsp_demo/issues'],
    ['GET', '/api/v1/teams/tea_demo/cycles'],
    ['GET', '/api/v1/workspaces/wsp_demo/contacts'],
    ['GET', '/api/v1/workspaces/wsp_demo/companies'],
    ['GET', '/api/v1/workspaces/wsp_demo/deals'],
    ['GET', '/api/v1/workspaces/wsp_demo/tasks'],
    ['GET', '/api/v1/workspaces/wsp_demo/databases'],
    ['GET', '/api/v1/workspaces/wsp_demo/events'],
    ['GET', '/api/v1/users'],
    ['GET', '/api/v1/integration-providers'],
  ] as const)(
    'does not expose the removed feature route %s %s',
    async (method, url) => {
      const response = await app.inject({ method, url });

      expect(response.statusCode).toBe(404);
      expect(response.headers['x-request-id']).toMatch(/^req_/);
    },
  );
});

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

  it.each([3000, 3001, 3002])(
    'allows profile PATCH preflight from localhost:%s',
    async (port) => {
      const origin = `http://localhost:${port}`;
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/me',
        headers: {
          origin,
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'content-type,authorization',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(
        String(response.headers['access-control-allow-methods'])
          .split(',')
          .map((method) => method.trim()),
      ).toContain('PATCH');
      expect(response.headers['access-control-allow-headers']).toBe(
        'content-type,authorization',
      );
    },
  );

  it('serves the unwrapped health endpoint with a correlation id', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });
  it.each([
    '/api/v1/me',
    '/api/v1/workspaces',
    '/api/v1/workspaces/wsp_demo/teams',
    '/api/v1/workspaces/wsp_demo/projects',
    '/api/v1/workspaces/wsp_demo/project-statuses',
    '/api/v1/workspaces/wsp_demo/issues',
    '/api/v1/workspaces/wsp_demo/teams/tea_demo/cycles',
  ])('requires authentication for %s', async (url) => {
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(401);
  });
  it.each([
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

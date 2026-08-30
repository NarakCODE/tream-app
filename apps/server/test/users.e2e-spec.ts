import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApplication } from '../src/application.factory';

describe('Users API (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    app = await createApplication();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the create response in the standard envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'ada@example.com', name: 'Ada Lovelace' },
    });
    const body = response.json<{
      data: { id: string; email: string };
      meta: { requestId: string };
    }>();

    expect(response.statusCode).toBe(201);
    expect(body.data).toMatchObject({ email: 'ada@example.com' });
    expect(body.data.id).toMatch(/^usr_/);
    expect(body.meta.requestId).toMatch(/^req_/);
  });

  it('returns typed validation errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'not-an-email', name: '' },
    });
    const body = response.json<{
      error: { code: string; details: unknown[] };
    }>();

    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(2);
  });
});

import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import {
  configureApplication,
  createFastifyAdapter,
} from '../src/application.factory';
import { IdempotencyRepository } from '../src/common/idempotency/idempotency.repository';
import { AUTH_REPOSITORY } from '../src/modules/iam/application/ports/auth-repository.port';
import { MAGIC_LINK_SENDER } from '../src/modules/iam/application/ports/magic-link-sender.port';
import { TokenService } from '../src/modules/iam/application/token.service';
import { InMemoryAuthRepository } from './helpers/in-memory-auth.repository';
import {
  idempotentBearer,
  InMemoryIdempotencyRepository,
} from './helpers/in-memory-idempotency.repository';
import { RecordingMagicLinkSender } from './helpers/recording-magic-link.sender';

interface ResponseEnvelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface ErrorEnvelope {
  error: { code: string; message: string; details: unknown };
  meta: { requestId: string; timestamp: string };
}

interface SessionResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const signupPayload = {
  email: 'ada@example.com',
  password: 'a secure passphrase',
  fullName: 'Ada Lovelace',
};

describe('Authentication API (e2e)', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryAuthRepository;
  let magicLinkSender: RecordingMagicLinkSender;
  let idempotencyRepository: InMemoryIdempotencyRepository;
  let tokenService: TokenService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.JWT_ACCESS_SECRET =
      'test-access-secret-that-is-at-least-32-characters';
    repository = new InMemoryAuthRepository();
    magicLinkSender = new RecordingMagicLinkSender();
    idempotencyRepository = new InMemoryIdempotencyRepository();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_REPOSITORY)
      .useValue(repository)
      .overrideProvider(IdempotencyRepository)
      .useValue(idempotencyRepository)
      .overrideProvider(MAGIC_LINK_SENDER)
      .useValue(magicLinkSender)
      .compile();

    tokenService = module.get(TokenService);
    app = module.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { bufferLogs: true },
    );
    await configureApplication(app);
  });

  beforeEach(() => {
    repository.reset();
    magicLinkSender.reset();
    idempotencyRepository.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('supports password authentication, protected profiles, refresh rotation, and logout', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: signupPayload,
    });
    const signupBody = signup.json<ResponseEnvelope<SessionResponse>>();

    expect(signup.statusCode).toBe(201);
    expect(signupBody.data.user).toMatchObject({
      email: signupPayload.email,
      fullName: signupPayload.fullName,
      avatarUrl: null,
    });
    expect(signupBody.data.user.id).toMatch(/^usr_/);
    expect(signupBody.data.accessToken).toBeTruthy();
    expect(signupBody.data.refreshToken).toMatch(/^rfr_/);
    expect(signupBody.data.user).not.toHaveProperty('passwordHash');
    expect(signupBody.meta.requestId).toMatch(/^req_/);

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json<ErrorEnvelope>().error.code).toBe(
      'UNAUTHORIZED',
    );

    const profile = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${signupBody.data.accessToken}` },
    });
    expect(profile.statusCode).toBe(200);
    expect(
      profile.json<ResponseEnvelope<SessionResponse['user']>>().data,
    ).toMatchObject({
      email: signupPayload.email,
      fullName: signupPayload.fullName,
    });

    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: idempotentBearer(signupBody.data.accessToken),
      payload: {
        fullName: 'Ada Byron',
        avatarUrl: 'https://example.com/ada.png',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(
      updated.json<ResponseEnvelope<SessionResponse['user']>>().data,
    ).toMatchObject({
      fullName: 'Ada Byron',
      avatarUrl: 'https://example.com/ada.png',
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: signupPayload.email, password: 'wrong password' },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: signupPayload.email,
        password: signupPayload.password,
      },
    });
    expect(login.statusCode).toBe(200);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: signupBody.data.refreshToken },
    });
    const refreshBody = refresh.json<ResponseEnvelope<SessionResponse>>();
    expect(refresh.statusCode).toBe(200);
    expect(refreshBody.data.refreshToken).not.toBe(
      signupBody.data.refreshToken,
    );

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: signupBody.data.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: idempotentBearer(refreshBody.data.accessToken),
      payload: { refreshToken: refreshBody.data.refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const revoked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: refreshBody.data.refreshToken },
    });
    expect(revoked.statusCode).toBe(401);
  });

  it('delivers generic, single-use, expiring magic links', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: signupPayload,
    });

    const missingAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email: 'missing@example.com' },
    });
    expect(missingAccount.statusCode).toBe(202);
    expect(
      missingAccount.json<ResponseEnvelope<{ accepted: true }>>().data,
    ).toEqual({ accepted: true });
    expect(magicLinkSender.messages).toHaveLength(0);

    const requested = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email: signupPayload.email },
    });
    expect(requested.statusCode).toBe(202);
    expect(magicLinkSender.messages).toHaveLength(1);

    const token = magicLinkSender.messages[0]?.token;
    expect(token).toMatch(/^mag_/);
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/verify',
      payload: { token },
    });
    expect(verified.statusCode).toBe(200);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/verify',
      payload: { token },
    });
    expect(reused.statusCode).toBe(401);

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link',
      payload: { email: signupPayload.email },
    });
    const expiringToken = magicLinkSender.messages.at(-1)?.token;
    expect(expiringToken).toBeDefined();
    if (expiringToken !== undefined) {
      repository.expireMagicLink(tokenService.hashOpaqueToken(expiringToken));
    }
    const expired = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/magic-link/verify',
      payload: { token: expiringToken },
    });
    expect(expired.statusCode).toBe(401);
  });

  it('normalizes inputs and rejects duplicates or invalid payloads', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        email: 'not-an-email',
        password: 'short',
        fullName: '',
        unexpected: true,
      },
    });
    const invalidBody = invalid.json<ErrorEnvelope>();
    expect(invalid.statusCode).toBe(400);
    expect(invalidBody.error.code).toBe('VALIDATION_ERROR');

    const firstSignup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: {
        ...signupPayload,
        email: '  ADA@EXAMPLE.COM  ',
        fullName: '  Ada Lovelace  ',
      },
    });
    expect(firstSignup.statusCode).toBe(201);
    expect(
      firstSignup.json<ResponseEnvelope<SessionResponse>>().data.user,
    ).toMatchObject({ email: 'ada@example.com', fullName: 'Ada Lovelace' });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: signupPayload,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json<ErrorEnvelope>().error.code).toBe(
      'RESOURCE_CONFLICT',
    );
  });
});

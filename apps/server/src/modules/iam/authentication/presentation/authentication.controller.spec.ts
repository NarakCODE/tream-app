import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import { appConfig } from '../../../../config/app.config';
import { AuthenticationService } from '../application/authentication.service';
import { AuthenticationController } from './authentication.controller';
import type { AuthenticatedRequest } from './authentication.guard';
describe('Authentication browser contract', () => {
  const request = (headers: Record<string, string>) =>
    ({
      headers,
      ip: '127.0.0.1',
      user: { id: 'user', email: 'user@example.com', sessionId: 'session' },
    }) as unknown as AuthenticatedRequest;
  const result = {
    user: { id: 'user' },
    accessToken: 'access',
    refreshToken: 'refresh-secret',
    expiresIn: 900,
  };
  let auth: AuthenticationService;
  let controller: AuthenticationController;
  let header: jest.Mock;
  let reply: FastifyReply;
  beforeEach(() => {
    auth = {
      throttle: jest.fn().mockResolvedValue(undefined),
      signup: jest.fn().mockResolvedValue({
        message: 'Account created. Verify your email before signing in.',
      }),
      login: jest.fn().mockResolvedValue(result),
      refresh: jest.fn().mockResolvedValue(result),
      revoke: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthenticationService;
    const configuration = appConfig();
    configuration.app.nodeEnv = 'production';
    configuration.app.corsOrigin =
      'https://first.example, https://second.example';
    controller = new AuthenticationController(
      auth,
      new ConfigService<ApplicationConfiguration, true>(configuration),
    );
    header = jest.fn();
    reply = { header } as unknown as FastifyReply;
  });
  it('production browser login sets secure cookie and omits refresh secret from JSON', async () => {
    const body = await controller.login(
      { email: 'user@example.com', password: 'password' },
      request({ origin: 'https://second.example' }),
      reply,
    );
    expect(body).not.toHaveProperty('refreshToken');
    expect(header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly; Secure; SameSite=Strict;'),
    );
  });
  it('returns pending verification on signup without issuing browser refresh storage', async () => {
    const body = await controller.signup(
      {
        email: 'new@example.com',
        password: 'long-password-123',
        fullName: 'New User',
      },
      request({ origin: 'https://second.example' }),
    );
    expect(body).toEqual({
      message: 'Account created. Verify your email before signing in.',
    });
    expect(header).not.toHaveBeenCalled();
  });
  it('does not set a refresh cookie when login is denied pending verification', async () => {
    jest
      .spyOn(auth, 'login')
      .mockRejectedValue(
        new ForbiddenException('Verify your email before signing in.'),
      );
    await expect(
      controller.login(
        { email: 'user@example.com', password: 'password' },
        request({ origin: 'https://second.example' }),
        reply,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(header).not.toHaveBeenCalled();
  });
  it('requires matching Origin for cookie refresh including missing Origin', async () => {
    const refreshSpy = jest.spyOn(auth, 'refresh');
    await expect(
      controller.refresh(
        {},
        request({ cookie: 'tream_refresh=secret' }),
        reply,
      ),
    ).rejects.toThrow('Untrusted browser origin');
    await expect(
      controller.refresh(
        {},
        request({
          origin: 'https://evil.example',
          cookie: 'tream_refresh=secret',
        }),
        reply,
      ),
    ).rejects.toThrow('Untrusted browser origin');
    expect(refreshSpy).not.toHaveBeenCalled();
  });
  it('supports non-browser opaque tokens explicitly through JSON', async () => {
    const body = await controller.login(
      { email: 'user@example.com', password: 'password' },
      request({}),
      reply,
    );
    expect(body).toHaveProperty('refreshToken');
    expect(header).not.toHaveBeenCalled();
  });
  it('logout-all clears browser refresh storage', async () => {
    await controller.logoutAll(request({}), reply);
    expect(header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=0'),
    );
  });
});

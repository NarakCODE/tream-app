import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import { Public } from '../../../../common/decorators/public.decorator';
import { SkipIdempotency } from '../../../../common/decorators/skip-idempotency.decorator';
import {
  AuthenticationService,
  duration,
} from '../application/authentication.service';
import type { AuthenticatedRequest } from './authentication.guard';
import { AuthenticationOriginGuard } from './authentication-origin.guard';
import {
  EmailDto,
  LoginDto,
  ProfileDto,
  RefreshDto,
  ResetDto,
  SignupDto,
  TokenDto,
} from './authentication.dto';
@Controller('auth')
@SkipIdempotency()
@UseGuards(AuthenticationOriginGuard)
export class AuthenticationController {
  constructor(
    private readonly auth: AuthenticationService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}
  private async limit(
    req: AuthenticatedRequest,
    operation: string,
    email?: string,
  ) {
    await this.auth.throttle(operation, req.ip, email);
  }
  private cookie(
    req: AuthenticatedRequest,
    res: FastifyReply,
    result: unknown,
  ) {
    if (
      typeof result !== 'object' ||
      result === null ||
      !('refreshToken' in result) ||
      typeof result.refreshToken !== 'string'
    )
      return result;
    if (req.headers.origin) {
      this.checkOrigin(req);
      res.header(
        'Set-Cookie',
        `tream_refresh=${result.refreshToken}; HttpOnly;${this.secureCookie()} SameSite=Strict; Path=/api/v1/auth; Max-Age=${Math.floor(duration(this.config.getOrThrow('auth.jwt.refreshTtl', { infer: true })) / 1000)}`,
      );
      const safe = { ...result };
      delete safe.refreshToken;
      return safe;
    }
    return result;
  }
  private secureCookie() {
    return this.config.getOrThrow('app.nodeEnv', { infer: true }) ===
      'production'
      ? ' Secure;'
      : '';
  }
  private clearCookie(res: FastifyReply) {
    res.header(
      'Set-Cookie',
      `tream_refresh=; HttpOnly;${this.secureCookie()} SameSite=Strict; Path=/api/v1/auth; Max-Age=0`,
    );
  }
  private checkOrigin(req: AuthenticatedRequest) {
    const allowed = this.config
      .getOrThrow('app.corsOrigin', { infer: true })
      .split(',')
      .map((origin) => origin.trim());
    if (!req.headers.origin || !allowed.includes(req.headers.origin))
      throw new UnauthorizedException('Untrusted browser origin');
  }
  private refreshToken(req: AuthenticatedRequest, dto?: RefreshDto) {
    if (req.headers.origin) this.checkOrigin(req);
    const cookie = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('tream_refresh='))
      ?.slice('tream_refresh='.length);
    if (cookie) {
      this.checkOrigin(req);
      return cookie;
    }
    if (!dto?.refreshToken)
      throw new UnauthorizedException('Refresh token required');
    return dto.refreshToken;
  }
  @Public() @Post('signup') async signup(
    @Body() dto: SignupDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.headers.origin) this.checkOrigin(req);
    await this.limit(req, 'signup', dto.email);
    return this.auth.signup(dto.email, dto.password, dto.fullName);
  }
  @Public() @Post('login') async login(
    @Body() dto: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (req.headers.origin) this.checkOrigin(req);
    await this.limit(req, 'login', dto.email);
    return this.cookie(
      req,
      res,
      await this.auth.login(dto.email, dto.password),
    );
  }
  @Public() @Post('refresh') async refresh(
    @Body() dto: RefreshDto = new RefreshDto(),
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = this.refreshToken(req, dto);
    await this.limit(req, 'refresh');
    return this.cookie(req, res, await this.auth.refresh(token));
  }
  @Post('logout') async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.revoke(req.user.id, req.user.sessionId);
    this.clearCookie(res);
    return { message: 'Logged out' };
  }
  @Post('logout-all') async logoutAll(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.revoke(req.user.id);
    this.clearCookie(res);
    return { message: 'All sessions revoked' };
  }
  @Get('sessions') sessions(@Req() req: AuthenticatedRequest) {
    return this.auth.sessions(req.user.id);
  }
  @Delete('sessions/:id') async revoke(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.revoke(req.user.id, id);
    if (id === req.user.sessionId) this.clearCookie(res);
    return { message: 'Session revoked' };
  }
  @Public() @Post('password-recovery') async recovery(
    @Body() dto: EmailDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req, 'recovery', dto.email);
    return this.auth.requestToken(dto.email, 'password-reset');
  }
  @Public() @Post('password-reset') async reset(
    @Body() dto: ResetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req, 'reset');
    return this.auth.consumeToken(dto.token, 'password-reset', dto.password);
  }
  @Public() @Post('email-verification/request') async requestVerification(
    @Body() dto: EmailDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req, 'verify-request', dto.email);
    return this.auth.requestToken(dto.email, 'verify-email');
  }
  @Public() @Post('email-verification/confirm') async verify(
    @Body() dto: TokenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req, 'verify');
    return this.auth.consumeToken(dto.token, 'verify-email');
  }
  @Public() @Post('magic-link/request') async requestMagic(
    @Body() dto: EmailDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req, 'magic-request', dto.email);
    return this.auth.requestToken(dto.email, 'magic-link');
  }
  @Public() @Post('magic-link/consume') async magic(
    @Body() dto: TokenDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (req.headers.origin) this.checkOrigin(req);
    await this.limit(req, 'magic');
    return this.cookie(
      req,
      res,
      await this.auth.consumeToken(dto.token, 'magic-link'),
    );
  }
}
@Controller('me')
@SkipIdempotency()
@UseGuards(AuthenticationOriginGuard)
export class ProfileController {
  constructor(private readonly auth: AuthenticationService) {}
  @Get() profile(@Req() req: AuthenticatedRequest) {
    return this.auth.profile(req.user.id);
  }
  @Patch()
  patch(@Body() dto: ProfileDto, @Req() req: AuthenticatedRequest) {
    return this.handleUpdate(dto, req);
  }
  @Put()
  put(@Body() dto: ProfileDto, @Req() req: AuthenticatedRequest) {
    return this.handleUpdate(dto, req);
  }
  @Post()
  post(@Body() dto: ProfileDto, @Req() req: AuthenticatedRequest) {
    return this.handleUpdate(dto, req);
  }
  private handleUpdate(dto: ProfileDto, req: AuthenticatedRequest) {
    const fullName = (dto.fullName ?? dto.name)?.trim();
    if (!fullName) {
      throw new BadRequestException('fullName is required');
    }
    return this.auth.updateProfile(req.user.id, fullName);
  }
}

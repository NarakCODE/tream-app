import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { AuthService } from '../application/auth.service';
import type { AuthenticatedUser } from '../domain/auth-user';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthSessionResponseDto,
  MagicLinkAcceptedResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RequestMagicLinkDto, VerifyMagicLinkDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignUpDto } from './dto/signup.dto';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Register an account and create a session' })
  @ApiStandardResponse(AuthSessionResponseDto, HttpStatus.CREATED)
  async signUp(@Body() input: SignUpDto): Promise<AuthSessionResponseDto> {
    return AuthSessionResponseDto.fromSession(
      await this.authService.signUp(input),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiStandardResponse(AuthSessionResponseDto)
  async login(@Body() input: LoginDto): Promise<AuthSessionResponseDto> {
    return AuthSessionResponseDto.fromSession(
      await this.authService.login(input),
    );
  }

  @Public()
  @Post('magic-link')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a passwordless sign-in link' })
  @ApiStandardResponse(MagicLinkAcceptedResponseDto, HttpStatus.ACCEPTED)
  async requestMagicLink(
    @Body() input: RequestMagicLinkDto,
  ): Promise<MagicLinkAcceptedResponseDto> {
    await this.authService.requestMagicLink(input.email);
    return { accepted: true };
  }

  @Public()
  @Post('magic-link/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a one-time magic link for a session' })
  @ApiStandardResponse(AuthSessionResponseDto)
  async verifyMagicLink(
    @Body() input: VerifyMagicLinkDto,
  ): Promise<AuthSessionResponseDto> {
    return AuthSessionResponseDto.fromSession(
      await this.authService.verifyMagicLink(input.token),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new session' })
  @ApiStandardResponse(AuthSessionResponseDto)
  async refresh(
    @Body() input: RefreshTokenDto,
  ): Promise<AuthSessionResponseDto> {
    return AuthSessionResponseDto.fromSession(
      await this.authService.refresh(input.refreshToken),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a refresh session' })
  @ApiNoContentResponse({ description: 'The refresh session was revoked.' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RefreshTokenDto,
  ): Promise<void> {
    await this.authService.logout(user.id, input.refreshToken);
  }
}

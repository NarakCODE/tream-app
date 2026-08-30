import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { ProfileService } from '../application/profile.service';
import type { AuthenticatedUser } from '../domain/auth-user';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserResponseDto } from './dto/auth-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiStandardResponse(AuthUserResponseDto)
  async getProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<AuthUserResponseDto> {
    return AuthUserResponseDto.fromEntity(
      await this.profileService.findById(currentUser.id),
    );
  }

  @Patch()
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiStandardResponse(AuthUserResponseDto)
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: UpdateProfileDto,
  ): Promise<AuthUserResponseDto> {
    return AuthUserResponseDto.fromEntity(
      await this.profileService.update(currentUser.id, input),
    );
  }
}

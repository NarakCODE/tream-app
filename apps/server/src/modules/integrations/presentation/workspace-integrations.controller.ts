import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { IntegrationsService } from '../application/integrations.service';
import {
  INTEGRATION_READ_ROLES,
  INTEGRATION_WRITE_ROLES,
} from '../domain/integration-role-policy';
import {
  IntegrationResponseDto,
  OAuthAuthorizationResponseDto,
} from './dto/integration.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/integrations', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @WorkspaceRoles(...INTEGRATION_READ_ROLES)
  @ApiOperation({ summary: 'List workspace integration connections' })
  @ApiResponse({ status: 200, type: [IntegrationResponseDto] })
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<IntegrationResponseDto[]> {
    return (await this.integrations.list(workspaceId)).map(
      IntegrationResponseDto.fromEntity,
    );
  }

  @Post('gmail/connect')
  @WorkspaceRoles(...INTEGRATION_WRITE_ROLES)
  @ApiOperation({ summary: 'Start a Gmail OAuth connection' })
  @ApiStandardResponse(OAuthAuthorizationResponseDto)
  connect(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OAuthAuthorizationResponseDto> {
    return this.integrations.connect(workspaceId, user.id);
  }
}

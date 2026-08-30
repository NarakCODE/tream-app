import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import { WorkspaceService } from '../application/workspace.service';
import type { AuthenticatedUser } from '../domain/auth-user';
import { WorkspaceMembershipGuard } from '../infrastructure/workspace-membership.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { WorkspaceRoles } from './decorators/workspace-roles.decorator';
import { WorkspaceMemberResponseDto } from './dto/workspace-member-response.dto';
import {
  AddWorkspaceMemberDto,
  UpdateWorkspaceMemberDto,
} from './dto/workspace.dto';

@ApiTags('Workspace members')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/members', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceMembersController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'List workspace members' })
  @ApiStandardArrayResponse(WorkspaceMemberResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceMemberResponseDto[]> {
    return (await this.workspaceService.listMembers(workspaceId)).map(
      (member) => WorkspaceMemberResponseDto.fromEntity(member),
    );
  }

  @Get(':memberId')
  @ApiOperation({ summary: 'Get a workspace member' })
  @ApiStandardResponse(WorkspaceMemberResponseDto)
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') membershipId: string,
  ): Promise<WorkspaceMemberResponseDto> {
    return WorkspaceMemberResponseDto.fromEntity(
      await this.workspaceService.findMember(workspaceId, membershipId),
    );
  }

  @Post()
  @WorkspaceRoles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Add an existing user to a workspace' })
  @ApiStandardResponse(WorkspaceMemberResponseDto, HttpStatus.CREATED)
  async add(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AddWorkspaceMemberDto,
  ): Promise<WorkspaceMemberResponseDto> {
    return WorkspaceMemberResponseDto.fromEntity(
      await this.workspaceService.addMember(workspaceId, user.id, input),
    );
  }

  @Patch(':memberId')
  @WorkspaceRoles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Change a workspace member role' })
  @ApiStandardResponse(WorkspaceMemberResponseDto)
  async changeRole(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateWorkspaceMemberDto,
  ): Promise<WorkspaceMemberResponseDto> {
    return WorkspaceMemberResponseDto.fromEntity(
      await this.workspaceService.changeMemberRole(
        workspaceId,
        membershipId,
        user.id,
        input.role,
      ),
    );
  }

  @Delete(':memberId')
  @WorkspaceRoles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a workspace member' })
  @ApiNoContentResponse({ description: 'The member was removed.' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('memberId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.workspaceService.removeMember(
      workspaceId,
      membershipId,
      user.id,
    );
  }
}

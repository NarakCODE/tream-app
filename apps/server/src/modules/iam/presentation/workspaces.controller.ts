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
import type { WorkspaceMembershipAccess } from '../domain/workspace-membership';
import { WorkspaceMembershipGuard } from '../infrastructure/workspace-membership.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentWorkspaceAccess } from './decorators/current-workspace-access.decorator';
import { WorkspaceRoles } from './decorators/workspace-roles.decorator';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from './dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user workspaces' })
  @ApiStandardArrayResponse(WorkspaceResponseDto)
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkspaceResponseDto[]> {
    return (await this.workspaceService.listForUser(user.id)).map((workspace) =>
      WorkspaceResponseDto.fromEntity(workspace),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiStandardResponse(WorkspaceResponseDto, HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return WorkspaceResponseDto.fromEntity(
      await this.workspaceService.create(user.id, input),
    );
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMembershipGuard)
  @ApiOperation({ summary: 'Get a workspace' })
  @ApiStandardResponse(WorkspaceResponseDto)
  get(
    @CurrentWorkspaceAccess() access: WorkspaceMembershipAccess,
  ): WorkspaceResponseDto {
    return WorkspaceResponseDto.fromEntity(access.workspace);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceMembershipGuard)
  @WorkspaceRoles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Update a workspace' })
  @ApiStandardResponse(WorkspaceResponseDto)
  async update(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return WorkspaceResponseDto.fromEntity(
      await this.workspaceService.update(workspaceId, user.id, input),
    );
  }

  @Delete(':workspaceId')
  @UseGuards(WorkspaceMembershipGuard)
  @WorkspaceRoles('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workspace' })
  @ApiNoContentResponse({ description: 'The workspace was deleted.' })
  async delete(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.workspaceService.delete(workspaceId, user.id);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiStandardArrayResponse,
  ApiStandardResponse,
} from '../../../common/decorators/api-standard-response.decorator';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { DynamicDataService } from '../application/dynamic-data.service';
import { CreateDatabaseDto, DatabaseResponseDto } from './dto/dynamic-data.dto';

@ApiTags('Dynamic Data')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/databases', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceDatabasesController {
  constructor(private readonly service: DynamicDataService) {}
  @Get()
  @WorkspaceRoles('OWNER', 'ADMIN', 'MEMBER', 'GUEST')
  @ApiOperation({ summary: 'List workspace databases' })
  @ApiStandardArrayResponse(DatabaseResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<DatabaseResponseDto[]> {
    return (await this.service.listDatabases(workspaceId)).map(
      DatabaseResponseDto.fromEntity,
    );
  }
  @Post()
  @WorkspaceRoles('OWNER', 'ADMIN', 'MEMBER')
  @ApiOperation({ summary: 'Create a custom database' })
  @ApiStandardResponse(DatabaseResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() input: CreateDatabaseDto,
  ): Promise<DatabaseResponseDto> {
    return DatabaseResponseDto.fromEntity(
      await this.service.createDatabase(workspaceId, input),
    );
  }
}

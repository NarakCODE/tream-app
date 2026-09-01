import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { WorkspaceMembershipGuard } from '../../iam/infrastructure/workspace-membership.guard';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { WorkspaceRoles } from '../../iam/presentation/decorators/workspace-roles.decorator';
import { CompaniesService } from '../application/companies.service';
import {
  COMPANY_READ_ROLES,
  COMPANY_WRITE_ROLES,
} from '../domain/company-role-policy';
import {
  CompanyDomainParamDto,
  CompanyResponseDto,
  CreateCompanyDto,
} from './dto/company.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/companies', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceCompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @WorkspaceRoles(...COMPANY_READ_ROLES)
  @ApiOperation({ summary: 'List active workspace companies' })
  @ApiCursorPaginatedResponse(CompanyResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<CompanyResponseDto>> {
    const page = await this.companiesService.list(
      workspaceId,
      query.cursor,
      query.limit,
    );
    return {
      ...page,
      items: page.items.map((company) =>
        CompanyResponseDto.fromEntity(company),
      ),
    };
  }

  @Get('by-domain/:domain')
  @WorkspaceRoles(...COMPANY_READ_ROLES)
  @ApiOperation({ summary: 'Find an active workspace company by domain' })
  @ApiStandardResponse(CompanyResponseDto)
  async findByDomain(
    @Param() params: CompanyDomainParamDto,
  ): Promise<CompanyResponseDto> {
    return CompanyResponseDto.fromEntity(
      await this.companiesService.findByDomain(
        params.workspaceId,
        params.domain,
      ),
    );
  }

  @Post()
  @WorkspaceRoles(...COMPANY_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a workspace company' })
  @ApiStandardResponse(CompanyResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return CompanyResponseDto.fromEntity(
      await this.companiesService.create(workspaceId, user.id, input),
    );
  }
}

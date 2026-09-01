import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCursorPaginatedResponse } from '../../../common/decorators/api-cursor-paginated-response.decorator';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';
import type { CursorPaginatedResult } from '../../../common/interfaces/api-response.interface';
import { ContactsQueryService } from '../../contacts/application/contacts-query.service';
import type { Contact } from '../../contacts/domain/contact';
import { ContactResponseDto } from '../../contacts/presentation/dto/contact.dto';
import { DealsQueryService } from '../../deals/application/deals-query.service';
import type { Deal } from '../../deals/domain/deal';
import { DealResponseDto } from '../../deals/presentation/dto/deal.dto';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { CompaniesService } from '../application/companies.service';
import type { CompanyAccess } from '../application/ports/companies-repository.port';
import { CompanyAccessGuard } from '../infrastructure/company-access.guard';
import { CompanyAccessMode } from './decorators/company-access.decorator';
import { CurrentCompanyAccess } from './decorators/current-company-access.decorator';
import {
  CompanyIdParamDto,
  CompanyResponseDto,
  UpdateCompanyDto,
} from './dto/company.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller({ path: 'companies', version: '1' })
@UseGuards(CompanyAccessGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly contactsQueryService: ContactsQueryService,
    private readonly dealsQueryService: DealsQueryService,
  ) {}

  @Get(':companyId')
  @ApiOperation({ summary: 'Get an active company' })
  @ApiStandardResponse(CompanyResponseDto)
  get(
    @Param() _params: CompanyIdParamDto,
    @CurrentCompanyAccess() access: CompanyAccess,
  ): CompanyResponseDto {
    return CompanyResponseDto.fromEntity(access.company);
  }

  @Get(':companyId/deals')
  @ApiOperation({ summary: 'List active deals assigned to a company' })
  @ApiCursorPaginatedResponse(DealResponseDto)
  async listDeals(
    @Param() _params: CompanyIdParamDto,
    @CurrentCompanyAccess() access: CompanyAccess,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<DealResponseDto>> {
    const page = await this.dealsQueryService.listForCompany(
      access.company.workspaceId,
      access.company.id,
      query.cursor,
      query.limit,
    );
    return {
      ...page,
      items: page.items.map((deal: Deal) => DealResponseDto.fromEntity(deal)),
    };
  }

  @Get(':companyId/contacts')
  @ApiOperation({ summary: 'List active contacts assigned to a company' })
  @ApiCursorPaginatedResponse(ContactResponseDto)
  async listContacts(
    @Param() _params: CompanyIdParamDto,
    @CurrentCompanyAccess() access: CompanyAccess,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<ContactResponseDto>> {
    const page = await this.contactsQueryService.listForCompany(
      access.company.workspaceId,
      access.company.id,
      query.cursor,
      query.limit,
    );
    return {
      ...page,
      items: page.items.map((contact: Contact) =>
        ContactResponseDto.fromEntity(contact),
      ),
    };
  }

  @Patch(':companyId')
  @CompanyAccessMode('write')
  @ApiOperation({ summary: 'Update an active company' })
  @ApiStandardResponse(CompanyResponseDto)
  async update(
    @Param() params: CompanyIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return CompanyResponseDto.fromEntity(
      await this.companiesService.update(params.companyId, user.id, input),
    );
  }

  @Delete(':companyId')
  @CompanyAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an active company' })
  @ApiNoContentResponse({ description: 'The company was deleted.' })
  async delete(
    @Param() params: CompanyIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.companiesService.delete(params.companyId, user.id);
  }
}

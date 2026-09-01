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
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { DealsService } from '../application/deals.service';
import type { DealAccess } from '../application/ports/deals-repository.port';
import { DealAccessGuard } from '../infrastructure/deal-access.guard';
import { CurrentDealAccess } from './decorators/current-deal-access.decorator';
import { DealAccessMode } from './decorators/deal-access.decorator';
import {
  AddDealContactDto,
  DealContactParamDto,
  DealIdParamDto,
  DealResponseDto,
  UpdateDealDto,
} from './dto/deal.dto';

@ApiTags('Deals')
@ApiBearerAuth()
@Controller({ path: 'deals', version: '1' })
@UseGuards(DealAccessGuard)
export class DealsController {
  constructor(
    private readonly dealsService: DealsService,
    private readonly contactsQueryService: ContactsQueryService,
  ) {}

  @Get(':dealId')
  @ApiOperation({ summary: 'Get an active deal' })
  @ApiStandardResponse(DealResponseDto)
  get(
    @Param() _params: DealIdParamDto,
    @CurrentDealAccess() access: DealAccess,
  ): DealResponseDto {
    return DealResponseDto.fromEntity(access.deal);
  }

  @Get(':dealId/contacts')
  @ApiOperation({ summary: 'List active contacts associated with a deal' })
  @ApiCursorPaginatedResponse(ContactResponseDto)
  async listContacts(
    @Param() _params: DealIdParamDto,
    @CurrentDealAccess() access: DealAccess,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<ContactResponseDto>> {
    const page = await this.contactsQueryService.listForDeal(
      access.deal.workspaceId,
      access.deal.id,
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

  @Post(':dealId/contacts')
  @DealAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Associate an active contact with a deal' })
  @ApiNoContentResponse({ description: 'The contact was associated.' })
  async addContact(
    @Param() params: DealIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: AddDealContactDto,
  ): Promise<void> {
    await this.dealsService.addContact(params.dealId, input.contactId, user.id);
  }

  @Delete(':dealId/contacts/:contactId')
  @DealAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a contact association from a deal' })
  @ApiNoContentResponse({ description: 'The contact was removed.' })
  async removeContact(
    @Param() params: DealContactParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.dealsService.removeContact(
      params.dealId,
      params.contactId,
      user.id,
    );
  }

  @Patch(':dealId')
  @DealAccessMode('write')
  @ApiOperation({ summary: 'Update an active deal' })
  @ApiStandardResponse(DealResponseDto)
  async update(
    @Param() params: DealIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateDealDto,
  ): Promise<DealResponseDto> {
    return DealResponseDto.fromEntity(
      await this.dealsService.update(params.dealId, user.id, input),
    );
  }

  @Delete(':dealId')
  @DealAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an active deal' })
  @ApiNoContentResponse({ description: 'The deal was deleted.' })
  async delete(
    @Param() params: DealIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.dealsService.delete(params.dealId, user.id);
  }
}

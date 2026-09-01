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
import { ContactsService } from '../application/contacts.service';
import {
  CONTACT_READ_ROLES,
  CONTACT_WRITE_ROLES,
} from '../domain/contact-role-policy';
import {
  ContactEmailParamDto,
  ContactResponseDto,
  CreateContactDto,
} from './dto/contact.dto';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller({ path: 'workspaces/:workspaceId/contacts', version: '1' })
@UseGuards(WorkspaceMembershipGuard)
export class WorkspaceContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @WorkspaceRoles(...CONTACT_READ_ROLES)
  @ApiOperation({ summary: 'List active workspace contacts' })
  @ApiCursorPaginatedResponse(ContactResponseDto)
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<ContactResponseDto>> {
    const page = await this.contactsService.list(
      workspaceId,
      query.cursor,
      query.limit,
    );
    return {
      ...page,
      items: page.items.map((contact) =>
        ContactResponseDto.fromEntity(contact),
      ),
    };
  }

  @Get('by-email/:email')
  @WorkspaceRoles(...CONTACT_READ_ROLES)
  @ApiOperation({ summary: 'Find an active workspace contact by email' })
  @ApiStandardResponse(ContactResponseDto)
  async findByEmail(
    @Param() params: ContactEmailParamDto,
  ): Promise<ContactResponseDto> {
    return ContactResponseDto.fromEntity(
      await this.contactsService.findByEmail(params.workspaceId, params.email),
    );
  }

  @Post()
  @WorkspaceRoles(...CONTACT_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a workspace contact' })
  @ApiStandardResponse(ContactResponseDto, HttpStatus.CREATED)
  async create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateContactDto,
  ): Promise<ContactResponseDto> {
    return ContactResponseDto.fromEntity(
      await this.contactsService.create(workspaceId, user.id, input),
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { ContactsService } from '../application/contacts.service';
import type { ContactAccess } from '../application/ports/contacts-repository.port';
import { ContactAccessGuard } from '../infrastructure/contact-access.guard';
import { ContactAccessMode } from './decorators/contact-access.decorator';
import { CurrentContactAccess } from './decorators/current-contact-access.decorator';
import {
  ContactIdParamDto,
  ContactResponseDto,
  UpdateContactDto,
} from './dto/contact.dto';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller({ path: 'contacts', version: '1' })
@UseGuards(ContactAccessGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get(':contactId')
  @ApiOperation({ summary: 'Get an active contact' })
  @ApiStandardResponse(ContactResponseDto)
  get(
    @Param() _params: ContactIdParamDto,
    @CurrentContactAccess() access: ContactAccess,
  ): ContactResponseDto {
    return ContactResponseDto.fromEntity(access.contact);
  }

  @Patch(':contactId')
  @ContactAccessMode('write')
  @ApiOperation({ summary: 'Update an active contact' })
  @ApiStandardResponse(ContactResponseDto)
  async update(
    @Param() params: ContactIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return ContactResponseDto.fromEntity(
      await this.contactsService.update(params.contactId, user.id, input),
    );
  }

  @Delete(':contactId')
  @ContactAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an active contact' })
  @ApiNoContentResponse({ description: 'The contact was deleted.' })
  async delete(
    @Param() params: ContactIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.contactsService.delete(params.contactId, user.id);
  }
}

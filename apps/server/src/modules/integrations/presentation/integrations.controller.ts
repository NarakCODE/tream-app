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
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { GmailService } from '../application/gmail.service';
import { IntegrationsService } from '../application/integrations.service';
import type { IntegrationAccess } from '../application/ports/integrations-repository.port';
import { IntegrationAccessGuard } from '../infrastructure/integration-access.guard';
import { CurrentIntegrationAccess } from './decorators/current-integration-access.decorator';
import { IntegrationAccessMode } from './decorators/integration-access.decorator';
import {
  EmailContentsDto,
  GmailDraftParamDto,
  GmailResourceParamDto,
  GmailThreadParamDto,
  IntegrationIdParamDto,
  IntegrationResponseDto,
  NormalizedDraftResponseDto,
  NormalizedEmailListResponseDto,
  NormalizedEmailResponseDto,
  NormalizedThreadResponseDto,
  OAuthAuthorizationResponseDto,
  SearchEmailsQueryDto,
  UpdateEmailDraftDto,
} from './dto/integration.dto';

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller({ path: 'integrations', version: '1' })
@UseGuards(IntegrationAccessGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly gmail: GmailService,
  ) {}

  @Get(':integrationId')
  @ApiOperation({ summary: 'Get integration connection status' })
  @ApiStandardResponse(IntegrationResponseDto)
  get(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): IntegrationResponseDto {
    return IntegrationResponseDto.fromEntity(this.integrations.get(access));
  }

  @Post(':integrationId/test')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Test Gmail credentials and permissions' })
  @ApiStandardResponse(IntegrationResponseDto)
  async test(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): Promise<IntegrationResponseDto> {
    return IntegrationResponseDto.fromEntity(
      await this.integrations.test(access),
    );
  }

  @Post(':integrationId/reconnect')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Start Gmail reauthorization' })
  @ApiStandardResponse(OAuthAuthorizationResponseDto)
  reconnect(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OAuthAuthorizationResponseDto> {
    return this.integrations.reconnect(access, user.id);
  }

  @Delete(':integrationId')
  @IntegrationAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke and disconnect an integration' })
  @ApiNoContentResponse({ description: 'The integration was disconnected.' })
  async disconnect(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): Promise<void> {
    await this.integrations.disconnect(access);
  }

  @Get(':integrationId/emails')
  @ApiOperation({ summary: 'Search normalized Gmail messages' })
  @ApiStandardResponse(NormalizedEmailListResponseDto)
  async searchEmails(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
    @Query() query: SearchEmailsQueryDto,
  ): Promise<NormalizedEmailListResponseDto> {
    return {
      items: (await this.gmail.search(access, query)).map(
        NormalizedEmailResponseDto.fromEntity,
      ),
    };
  }

  @Get(':integrationId/emails/:messageId')
  @ApiOperation({ summary: 'Get a normalized Gmail message' })
  @ApiStandardResponse(NormalizedEmailResponseDto)
  async getEmail(
    @Param() params: GmailResourceParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): Promise<NormalizedEmailResponseDto> {
    return NormalizedEmailResponseDto.fromEntity(
      await this.gmail.getMessage(access, params.messageId),
    );
  }

  @Get(':integrationId/email-threads/:threadId')
  @ApiOperation({ summary: 'Get normalized messages in a Gmail thread' })
  @ApiStandardResponse(NormalizedThreadResponseDto)
  getThread(
    @Param() params: GmailThreadParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): Promise<NormalizedThreadResponseDto> {
    return this.gmail.getThread(access, params.threadId);
  }

  @Post(':integrationId/email-drafts')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Create a Gmail draft' })
  @ApiStandardResponse(NormalizedDraftResponseDto, HttpStatus.CREATED)
  createDraft(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
    @Body() input: EmailContentsDto,
  ): Promise<NormalizedDraftResponseDto> {
    return this.gmail.createDraft(access, input);
  }

  @Patch(':integrationId/email-drafts/:draftId')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Update a Gmail draft' })
  @ApiStandardResponse(NormalizedDraftResponseDto)
  updateDraft(
    @Param() params: GmailDraftParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
    @Body() input: UpdateEmailDraftDto,
  ): Promise<NormalizedDraftResponseDto> {
    return this.gmail.updateDraft(access, params.draftId, input);
  }

  @Post(':integrationId/email-drafts/:draftId/send')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Send an existing Gmail draft' })
  @ApiStandardResponse(NormalizedEmailResponseDto)
  async sendDraft(
    @Param() params: GmailDraftParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
  ): Promise<NormalizedEmailResponseDto> {
    return NormalizedEmailResponseDto.fromEntity(
      await this.gmail.sendDraft(access, params.draftId),
    );
  }

  @Post(':integrationId/emails/send')
  @IntegrationAccessMode('write')
  @ApiOperation({ summary: 'Send a direct Gmail message as the current user' })
  @ApiStandardResponse(NormalizedEmailResponseDto)
  async sendEmail(
    @Param() _params: IntegrationIdParamDto,
    @CurrentIntegrationAccess() access: IntegrationAccess,
    @Body() input: EmailContentsDto,
  ): Promise<NormalizedEmailResponseDto> {
    return NormalizedEmailResponseDto.fromEntity(
      await this.gmail.send(access, input),
    );
  }
}

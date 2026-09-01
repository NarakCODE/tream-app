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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { IssuesService } from '../application/issues.service';
import { IssueAccessGuard } from '../infrastructure/issue-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { IssueResponseDto, UpdateIssueDto } from './dto/issue.dto';

@ApiTags('Issues')
@ApiBearerAuth()
@Controller({ path: 'issues/:issueId', version: '1' })
@UseGuards(IssueAccessGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'Get issue details' })
  @ApiStandardResponse(IssueResponseDto)
  async get(@Param('issueId') issueId: string): Promise<IssueResponseDto> {
    const issue = await this.issuesService.findById(issueId);
    return IssueResponseDto.fromEntity(issue);
  }

  @Patch()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Update issue details' })
  @ApiStandardResponse(IssueResponseDto)
  async update(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateIssueDto,
  ): Promise<IssueResponseDto> {
    const issue = await this.issuesService.update(issueId, user.id, input);
    return IssueResponseDto.fromEntity(issue);
  }

  @Delete()
  @WorkManagementAccessMode('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete issue' })
  async delete(
    @Param('issueId') issueId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.issuesService.delete(issueId, user.id);
  }
}

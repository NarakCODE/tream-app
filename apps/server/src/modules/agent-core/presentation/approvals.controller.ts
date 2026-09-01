import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { AgentCoreService } from '../application/agent-core.service';
import {
  ApprovalIdParamDto,
  ApprovalResponseDto,
  RejectApprovalDto,
} from './dto/agent-core.dto';

@ApiTags('Agent Approvals')
@ApiBearerAuth()
@Controller({ path: 'approvals', version: '1' })
export class ApprovalsController {
  constructor(private readonly service: AgentCoreService) {}
  @Get(':approvalId') @ApiStandardResponse(ApprovalResponseDto) async get(
    @Param() p: ApprovalIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<ApprovalResponseDto> {
    return ApprovalResponseDto.from(
      await this.service.getApproval(p.approvalId, u.id),
    );
  }
  @Post(':approvalId/approve')
  @HttpCode(200)
  @ApiStandardResponse(ApprovalResponseDto)
  async approve(
    @Param() p: ApprovalIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<ApprovalResponseDto> {
    return ApprovalResponseDto.from(
      await this.service.decideApproval(p.approvalId, u.id, 'APPROVED', null),
    );
  }
  @Post(':approvalId/reject')
  @HttpCode(200)
  @ApiStandardResponse(ApprovalResponseDto)
  async reject(
    @Param() p: ApprovalIdParamDto,
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: RejectApprovalDto,
  ): Promise<ApprovalResponseDto> {
    return ApprovalResponseDto.from(
      await this.service.decideApproval(
        p.approvalId,
        u.id,
        'REJECTED',
        dto.reason ?? null,
      ),
    );
  }
}

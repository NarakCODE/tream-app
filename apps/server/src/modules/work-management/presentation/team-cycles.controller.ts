import { Controller, Get, HttpStatus, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import { CyclesService } from '../application/cycles.service';
import { TeamAccessGuard } from '../infrastructure/team-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { CycleResponseDto } from './dto/cycle.dto';

@ApiTags('Cycles')
@ApiBearerAuth()
@Controller({ path: 'teams/:teamId/cycles', version: '1' })
@UseGuards(TeamAccessGuard)
export class TeamCyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'List cycles for a team' })
  @ApiStandardResponse(CycleResponseDto, HttpStatus.OK)
  async list(@Param('teamId') teamId: string): Promise<CycleResponseDto[]> {
    const list = await this.cyclesService.list(teamId);
    return list.map((c) => CycleResponseDto.fromEntity(c));
  }
}

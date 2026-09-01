import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponse } from '../../../common/decorators/api-standard-response.decorator';
import type { AuthenticatedUser } from '../../iam/domain/auth-user';
import { CurrentUser } from '../../iam/presentation/decorators/current-user.decorator';
import { CyclesService } from '../application/cycles.service';
import { CycleAccessGuard } from '../infrastructure/cycle-access.guard';
import { WorkManagementAccessMode } from './decorators/work-management-access.decorator';
import { CycleResponseDto, UpdateCycleDto } from './dto/cycle.dto';

@ApiTags('Cycles')
@ApiBearerAuth()
@Controller({ path: 'cycles/:cycleId', version: '1' })
@UseGuards(CycleAccessGuard)
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Get()
  @WorkManagementAccessMode('read')
  @ApiOperation({ summary: 'Get cycle details' })
  @ApiStandardResponse(CycleResponseDto)
  async get(@Param('cycleId') cycleId: string): Promise<CycleResponseDto> {
    const cycle = await this.cyclesService.findById(cycleId);
    return CycleResponseDto.fromEntity(cycle);
  }

  @Patch()
  @WorkManagementAccessMode('write')
  @ApiOperation({ summary: 'Update cycle details' })
  @ApiStandardResponse(CycleResponseDto)
  async update(
    @Param('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    const cycle = await this.cyclesService.update(cycleId, user.id, input);
    return CycleResponseDto.fromEntity(cycle);
  }

  @Post('complete')
  @WorkManagementAccessMode('write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete cycle and roll over open issues' })
  @ApiStandardResponse(CycleResponseDto, HttpStatus.OK)
  async complete(
    @Param('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CycleResponseDto> {
    const cycle = await this.cyclesService.complete(cycleId, user.id);
    return CycleResponseDto.fromEntity(cycle);
  }
}

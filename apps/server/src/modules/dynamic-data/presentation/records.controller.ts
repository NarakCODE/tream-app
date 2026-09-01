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
import { DynamicDataService } from '../application/dynamic-data.service';
import {
  RecordIdParamDto,
  RecordResponseDto,
  RecordValuesDto,
} from './dto/dynamic-data.dto';

@ApiTags('Dynamic Data')
@ApiBearerAuth()
@Controller({ path: 'records', version: '1' })
export class RecordsController {
  constructor(private readonly service: DynamicDataService) {}
  @Get(':recordId')
  @ApiOperation({ summary: 'Get an active record' })
  @ApiStandardResponse(RecordResponseDto)
  async get(
    @Param() p: RecordIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecordResponseDto> {
    return RecordResponseDto.fromEntity(
      await this.service.getRecord(p.recordId, user.id),
    );
  }
  @Patch(':recordId')
  @ApiOperation({ summary: 'Partially update record values' })
  @ApiStandardResponse(RecordResponseDto)
  async update(
    @Param() p: RecordIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RecordValuesDto,
  ): Promise<RecordResponseDto> {
    return RecordResponseDto.fromEntity(
      await this.service.updateRecord(p.recordId, user.id, input.values),
    );
  }
  @Delete(':recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a record' })
  @ApiNoContentResponse()
  async delete(
    @Param() p: RecordIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteRecord(p.recordId, user.id);
  }
  @Post(':recordId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a record deleted within 30 days' })
  @ApiStandardResponse(RecordResponseDto)
  async restore(
    @Param() p: RecordIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RecordResponseDto> {
    return RecordResponseDto.fromEntity(
      await this.service.restoreRecord(p.recordId, user.id),
    );
  }
}

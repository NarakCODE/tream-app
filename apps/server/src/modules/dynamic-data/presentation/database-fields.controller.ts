import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  FieldIdParamDto,
  FieldResponseDto,
  UpdateFieldDto,
} from './dto/dynamic-data.dto';

@ApiTags('Dynamic Data')
@ApiBearerAuth()
@Controller({ path: 'database-fields', version: '1' })
export class DatabaseFieldsController {
  constructor(private readonly service: DynamicDataService) {}
  @Get(':fieldId')
  @ApiOperation({ summary: 'Get a field definition' })
  @ApiStandardResponse(FieldResponseDto)
  async get(
    @Param() p: FieldIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FieldResponseDto> {
    return FieldResponseDto.fromEntity(
      await this.service.getField(p.fieldId, user.id),
    );
  }
  @Patch(':fieldId')
  @ApiOperation({ summary: 'Update a field definition' })
  @ApiStandardResponse(FieldResponseDto)
  async update(
    @Param() p: FieldIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateFieldDto,
  ): Promise<FieldResponseDto> {
    return FieldResponseDto.fromEntity(
      await this.service.updateField(p.fieldId, user.id, input),
    );
  }
  @Delete(':fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove field validation while retaining record history',
  })
  @ApiNoContentResponse()
  async delete(
    @Param() p: FieldIdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.service.deleteField(p.fieldId, user.id);
  }
}

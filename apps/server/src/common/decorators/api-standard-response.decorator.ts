import { applyDecorators, type HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

class StandardMetaDto {
  requestId!: string;
  timestamp!: string;
}

class StandardResponseDto {
  data!: object;
  meta!: StandardMetaDto;
}

export const ApiStandardResponse = <TModel extends Type<unknown>>(
  model: TModel,
  status: HttpStatus = 200,
): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model, StandardMetaDto, StandardResponseDto),
    ApiResponse({
      status,
      schema: {
        allOf: [
          { $ref: getSchemaPath(StandardResponseDto) },
          {
            properties: {
              data: { $ref: getSchemaPath(model) },
            },
          },
        ],
      },
    }),
  );

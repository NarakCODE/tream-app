import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

class PaginatedMetaDto {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
  hasNext!: boolean;
  hasPrevious!: boolean;
  requestId!: string;
  timestamp!: string;
}

class PaginatedResponseDto {
  data!: object[];
  meta!: PaginatedMetaDto;
}

export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model, PaginatedMetaDto, PaginatedResponseDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              data: { type: 'array', items: { $ref: getSchemaPath(model) } },
            },
          },
        ],
      },
    }),
  );

import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

class CursorPaginatedMetaDto {
  requestId!: string;
  timestamp!: string;
  cursor!: string | null;
  nextCursor!: string | null;
  hasNext!: boolean;
  limit!: number;
  total!: number;
}

class CursorPaginatedResponseDto {
  data!: object[];
  meta!: CursorPaginatedMetaDto;
}

export const ApiCursorPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
): MethodDecorator =>
  applyDecorators(
    ApiExtraModels(model, CursorPaginatedMetaDto, CursorPaginatedResponseDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(CursorPaginatedResponseDto) },
          {
            properties: {
              data: { type: 'array', items: { $ref: getSchemaPath(model) } },
            },
          },
        ],
      },
    }),
  );

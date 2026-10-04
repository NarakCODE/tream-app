import {
  ValidationPipe,
  type ValidationError,
  type ArgumentMetadata,
} from '@nestjs/common';
import {
  ValidationException,
  type ValidationErrorDetails,
} from '../exceptions/validation.exception';

const flattenErrors = (
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetails[] =>
  errors.flatMap((error) => {
    const field =
      parentPath.length > 0
        ? `${parentPath}.${error.property}`
        : error.property;
    const constraints = Object.values(error.constraints ?? {});
    const children = flattenErrors(error.children ?? [], field);

    return constraints.length > 0
      ? [{ field, constraints }, ...children]
      : children;
  });

export class AppValidationPipe extends ValidationPipe {
  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    const transformed: unknown = await super.transform(value, metadata);
    // Decorated optional class fields can be materialized as undefined by the
    // DTO constructor. Omitted JSON fields must remain omitted for PATCH and
    // changed-field events; explicit null, false and zero retain their meaning.
    const prune = (item: unknown): void => {
      if (typeof item !== 'object' || item === null || item instanceof Date)
        return;
      for (const [key, field] of Object.entries(item)) {
        if (field === undefined) delete (item as Record<string, unknown>)[key];
        else prune(field);
      }
    };
    prune(transformed);
    return transformed;
  }
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new ValidationException(flattenErrors(errors)),
    });
  }
}

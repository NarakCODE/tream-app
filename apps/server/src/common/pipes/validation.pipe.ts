import { ValidationPipe, type ValidationError } from '@nestjs/common';
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

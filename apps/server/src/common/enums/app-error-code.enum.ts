export enum AppErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  BadRequest = 'BAD_REQUEST',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  EmailNotVerified = 'EMAIL_NOT_VERIFIED',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  ResourceConflict = 'RESOURCE_CONFLICT',
  IntegrationError = 'INTEGRATION_ERROR',
  RateLimited = 'RATE_LIMITED',
  InternalServerError = 'INTERNAL_SERVER_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}

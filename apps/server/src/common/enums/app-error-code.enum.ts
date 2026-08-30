export enum AppErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  BadRequest = 'BAD_REQUEST',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  ResourceConflict = 'RESOURCE_CONFLICT',
  RateLimited = 'RATE_LIMITED',
  InternalServerError = 'INTERNAL_SERVER_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}

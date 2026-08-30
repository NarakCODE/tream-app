export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface PaginationMeta extends ResponseMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

export interface PaginatedApiResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
  meta: ResponseMeta;
}

export const createPaginationMeta = (
  result: PaginatedResult<unknown>,
  responseMeta: ResponseMeta,
): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));

  return {
    ...responseMeta,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages,
    hasNext: result.page < totalPages,
    hasPrevious: result.page > 1,
  };
};

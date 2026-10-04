import type { ZodType } from "zod";

export interface ApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
  params?:
    | Record<string, string | number | boolean | undefined | null>
    | URLSearchParams;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  body?: unknown;
}

export interface ApiClientConfig {
  baseUrl: string;
  getHeaders?: () => Promise<HeadersInit | undefined> | HeadersInit | undefined;
  credentials?: RequestCredentials;
  fetchFn?: typeof fetch;
}

export interface ApiClient {
  readonly baseUrl: string;
  get<T>(
    path: string,
    schema: ZodType<T>,
    options?: RequestOptions,
  ): Promise<T>;
  post<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  put<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  patch<T>(
    path: string,
    schema: ZodType<T>,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
  delete<T>(
    path: string,
    schema: ZodType<T>,
    options?: RequestOptions,
  ): Promise<T>;
  request<T>(
    path: string,
    method: HttpMethod,
    schema: ZodType<T>,
    options?: RequestOptions,
  ): Promise<T>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const {
    baseUrl,
    getHeaders,
    credentials: defaultCredentials,
    fetchFn = fetch,
  } = config;

  async function executeRequest<T>(
    path: string,
    method: HttpMethod,
    schema: ZodType<T>,
    options: RequestOptions = {},
  ): Promise<T> {
    // 1. Resolve URL
    let url: string;
    if (path.startsWith("http://") || path.startsWith("https://")) {
      url = path;
    } else {
      const normalizedBase = baseUrl.replace(/\/+$/, "");
      const normalizedPath = path.replace(/^\/+/, "");
      url = normalizedBase ? `${normalizedBase}/${normalizedPath}` : path;
    }

    // Append query params if provided
    if (options.params) {
      const searchParams = new URLSearchParams();
      if (options.params instanceof URLSearchParams) {
        options.params.forEach((value, key) => searchParams.append(key, value));
      } else {
        for (const [key, value] of Object.entries(options.params)) {
          if (value !== undefined && value !== null) {
            searchParams.append(key, String(value));
          }
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes("?") ? "&" : "?") + queryString;
      }
    }

    // 2. Prepare Headers
    const headers = new Headers();
    headers.set("Accept", "application/json");

    if (getHeaders) {
      const injected = await getHeaders();
      if (injected) {
        const injectedHeaders = new Headers(injected);
        injectedHeaders.forEach((value, key) => {
          headers.set(key, value);
        });
      }
    }

    if (options.headers) {
      const optionHeaders = new Headers(options.headers);
      optionHeaders.forEach((value, key) => {
        headers.set(key, value);
      });
    }

    // 3. Prepare Body & Content-Type
    let bodyPayload: BodyInit | undefined = undefined;
    const body = options.body;
    if (body !== undefined && body !== null) {
      if (
        typeof body === "string" ||
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof URLSearchParams ||
        body instanceof ArrayBuffer
      ) {
        bodyPayload = body;
      } else {
        bodyPayload = JSON.stringify(body);
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
      }
    }

    // 4. Build Fetch Options
    const fetchInit: RequestInit & {
      next?: { revalidate?: number | false; tags?: string[] };
    } = {
      method,
      headers,
      body: bodyPayload,
      signal: options.signal,
      credentials: options.credentials ?? defaultCredentials,
      cache: options.cache,
    };

    if (options.next) {
      fetchInit.next = options.next;
    }

    // 5. Execute Fetch
    const response = await fetchFn(url, fetchInit);

    // 6. Handle non-2xx Responses
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let message =
        response.statusText || `Request failed with status ${response.status}`;
      let details: unknown = undefined;

      try {
        const text = await response.text();
        if (text) {
          try {
            const errorData = JSON.parse(text);
            details = errorData;
            if (typeof errorData === "object" && errorData !== null) {
              const nestedError =
                typeof errorData.error === "object" && errorData.error !== null
                  ? (errorData.error as Record<string, unknown>)
                  : undefined;
              if (typeof errorData.code === "string") {
                code = errorData.code;
              } else if (typeof errorData.error === "string") {
                code = errorData.error;
              } else if (typeof nestedError?.code === "string") {
                code = nestedError.code;
              }

              if (typeof errorData.message === "string") {
                message = errorData.message;
              } else if (Array.isArray(errorData.message)) {
                message = errorData.message.join(", ");
              } else if (typeof nestedError?.message === "string") {
                message = nestedError.message;
              }
              if (nestedError?.details !== undefined) {
                details = nestedError.details;
              }
            }
          } catch {
            message = text;
          }
        }
      } catch {
        // ignore body read error
      }

      throw new ApiError({
        status: response.status,
        code,
        message,
        details,
      });
    }

    // 7. Parse 2xx Success Response
    if (response.status === 204) {
      return schema.parse(undefined);
    }

    const data = await response.json();
    return schema.parse(data);
  }

  return {
    baseUrl,
    get<T>(
      path: string,
      schema: ZodType<T>,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, "GET", schema, options);
    },
    post<T>(
      path: string,
      schema: ZodType<T>,
      body?: unknown,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, "POST", schema, {
        ...options,
        body: body ?? options?.body,
      });
    },
    put<T>(
      path: string,
      schema: ZodType<T>,
      body?: unknown,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, "PUT", schema, {
        ...options,
        body: body ?? options?.body,
      });
    },
    patch<T>(
      path: string,
      schema: ZodType<T>,
      body?: unknown,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, "PATCH", schema, {
        ...options,
        body: body ?? options?.body,
      });
    },
    delete<T>(
      path: string,
      schema: ZodType<T>,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, "DELETE", schema, options);
    },
    request<T>(
      path: string,
      method: HttpMethod,
      schema: ZodType<T>,
      options?: RequestOptions,
    ): Promise<T> {
      return executeRequest(path, method, schema, options);
    },
  };
}

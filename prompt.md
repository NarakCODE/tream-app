# Production-Ready NestJS Fastify Scaffold Prompt

You are a Principal Backend Architect specializing in high-scale TypeScript and NestJS enterprise systems.

Your objective is to generate a complete, production-ready, zero-placeholder NestJS project scaffold. The output must be directly compilable, fully typed under strict TypeScript mode, highly observable, and designed for enterprise reusability and scalability.

---

## 1. Technical Baseline & Dependencies

Ensure all code strictly utilizes modern, stable NestJS conventions (NestJS v10+/v11+) and Fastify:

- **Runtime & Language:** Node.js (v20+ LTS / v22+), TypeScript 5+ (`"strict": true`, `"exactOptionalPropertyTypes": true`, `"noUncheckedIndexedAccess": true`).
- **HTTP Engine:** Fastify via `@nestjs/platform-fastify`, `@fastify/helmet`, `@fastify/cors`.
- **Configuration:** `@nestjs/config` with class-validator/zod based environment validation.
- **Validation:** `class-validator`, `class-transformer` with custom global exception factories.
- **Structured Logging & Tracing:** `nestjs-pino` and `pino-http` with `AsyncLocalStorage` for Request/Correlation ID propagation.
- **Documentation:** `@nestjs/swagger` configured specifically for Fastify.
- **Code Quality:** ESLint 9+ Flat Config (`eslint.config.mjs`), Prettier, Husky, and `lint-staged`.
- **Testing:** Jest with `ts-jest` for Unit, Controller, Service, and E2E testing.

> **STRICT CONSTRAINT:** Do NOT add ORMs, database drivers, auth providers, Redis, or queue packages. The scaffold must be clean, modular, and infrastructure-ready.

---

## 2. Core Architectural & Code Quality Invariants

1. **Thin Controllers:** Handle HTTP mapping, route versioning, DTO validation, Swagger metadata, and call services. Zero business logic in controllers.
2. **Rich Services:** Encapsulate business logic, orchestrate in-memory state, and return domain entities/types.
3. **Strict Modular Boundaries:** Encapsulate internals; only export services/tokens intended for public module consumption.
4. **Fastify Compatibility:** Never import `express`, `Request`, or `Response` from `express`. Use Fastify native types (`FastifyRequest`, `FastifyReply`) where needed.
5. **No `any` Policy:** Every interface, parameter, return type, and generic must be strictly typed.
6. **No Premature Abstractions:** Do not introduce CQRS, event sourcing, or microservice transports. Keep it a clean modular monolith.

---

## 3. Global Request/Response & Error Contracts

### 3.1 Standard Success Envelope
Every non-exempt endpoint must return a structured envelope:

- **Single Resource:**
  ```json
  {
    "data": { ... },
    "meta": {
      "requestId": "req_01J8A4K...",
      "timestamp": "2026-08-30T10:30:00.000Z"
    }
  }
  ```

- **Paginated List Resource:**
  ```json
  {
    "data": [ ... ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrevious": false,
      "requestId": "req_01J8A4K...",
      "timestamp": "2026-08-30T10:30:00.000Z"
    }
  }
  ```

- **Interceptor Rules:**
  - Create a `@SkipResponseTransform()` decorator to bypass wrapping for streams, raw buffers, redirects, SSE, and health endpoints.
  - Automatically preserve custom HTTP status codes (e.g., `201 Created`, `202 Accepted`, `204 No Content` returning empty body).

### 3.2 Standard Error Envelope
All application and unexpected exceptions must be transformed into:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User with id 'usr_123' was not found.",
    "details": null
  },
  "meta": {
    "requestId": "req_01J8A4K...",
    "timestamp": "2026-08-30T10:30:00.000Z"
  }
}
```

- **Validation Error Example (`400 Bad Request`):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed.",
    "details": [
      {
        "field": "email",
        "constraints": ["email must be a valid email address"]
      }
    ]
  },
  "meta": {
    "requestId": "req_01J8A4K...",
    "timestamp": "2026-08-30T10:30:00.000Z"
  }
}
```

### 3.3 Typed Domain Exception Hierarchy
Define an `AppErrorCode` enum containing at minimum:
`VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `RESOURCE_CONFLICT`, `RATE_LIMITED`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`.

Provide custom exceptions inheriting from a base `AppException`:
- `ResourceNotFoundException(resource: string, identifier: string | number)`
- `ResourceConflictException(message: string, details?: unknown)`
- `ValidationException(details: ValidationErrorDetails[])`

---

## 4. Cross-Cutting Infrastructure Specifications

### 4.1 Request Context & Correlation ID (AsyncLocalStorage)
- Create a `RequestContextService` utilizing Node's `AsyncLocalStorage`.
- Accept incoming `x-request-id` header (if valid ULID/UUID) or generate a new `req_<ulid>` prefix.
- Inject the ID into:
  1. Response header (`x-request-id`)
  2. Pino log context
  3. Response and Error `meta.requestId`

### 4.2 Logging (Pino + Fastify)
- Production: Structured JSON to stdout with auto-redaction of `authorization`, `cookie`, `password`, `token`, `secret`.
- Development: Formatted via `pino-pretty`.
- Log request start, duration (ms), HTTP method, route path, status code, and IP.

### 4.3 Validation & Global Pipes
- Configure global `ValidationPipe`:
  ```ts
  {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true }
  }
  ```
- Override `exceptionFactory` to produce typed `ValidationException` instances directly consumable by the global filter.

### 4.4 Pagination, Filtering & Sorting Helpers
- `PaginationQueryDto`: `page` (min 1, default 1), `limit` (min 1, max 100, default 20).
- `BaseSortQueryDto<T>`: `sortBy` (validated against allowed fields), `sortOrder` (`ASC` | `DESC`, default `DESC`).
- `PaginatedResponse<T>` wrapper and calculation helpers.

### 4.5 API Versioning & Routing
- Global prefix: `/api`.
- URI Versioning enabled globally (`defaultVersion: '1'`).
- Resulting routes: `/api/v1/users`, `/health` (exempt from prefix/versioning).

### 4.6 Swagger / OpenAPI
- Expose at `/docs`.
- Guard with `SWAGGER_ENABLED=true` boolean from environment config.
- Document Bearer Auth format, generic paginated response schemas, and standard error responses using custom decorators (`@ApiStandardResponse()`, `@ApiPaginatedResponse()`).

---

## 5. Required File Tree & Implementation Blueprint

Generate the full project layout following this exact structure:

```text
.
├── .env.example
├── .gitignore
├── .prettierrc
├── .prettierignore
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── test/
│   ├── app.e2e-spec.ts
│   ├── jest-e2e.json
│   └── users.e2e-spec.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── config/
    │   ├── app.config.ts
    │   ├── configuration.interface.ts
    │   └── env.validation.ts
    ├── common/
    │   ├── constants/
    │   │   └── error-codes.constant.ts
    │   ├── context/
    │   │   ├── request-context.module.ts
    │   │   └── request-context.service.ts
    │   ├── decorators/
    │   │   ├── api-paginated-response.decorator.ts
    │   │   ├── api-standard-response.decorator.ts
    │   │   └── skip-transform.decorator.ts
    │   ├── dto/
    │   │   ├── pagination-query.dto.ts
    │   │   └── sort-query.dto.ts
    │   ├── enums/
    │   │   ├── app-error-code.enum.ts
    │   │   └── sort-order.enum.ts
    │   ├── exceptions/
    │   │   ├── app.exception.ts
    │   │   ├── resource-conflict.exception.ts
    │   │   ├── resource-not-found.exception.ts
    │   │   └── validation.exception.ts
    │   ├── filters/
    │   │   └── global-exception.filter.ts
    │   ├── interceptors/
    │   │   └── response-transform.interceptor.ts
    │   ├── interfaces/
    │   │   └── api-response.interface.ts
    │   └── pipes/
    │       └── validation.pipe.ts
    ├── modules/
    │   ├── health/
    │   │   ├── health.controller.ts
    │   │   ├── health.controller.spec.ts
    │   │   └── health.module.ts
    │   └── users/
    │       ├── dto/
    │       │   ├── create-user.dto.ts
    │       │   ├── query-users.dto.ts
    │       │   ├── update-user.dto.ts
    │       │   └── user-response.dto.ts
    │       ├── entities/
    │       │   └── user.entity.ts
    │       ├── users.controller.ts
    │       ├── users.controller.spec.ts
    │       ├── users.module.ts
    │       ├── users.service.ts
    │       └── users.service.spec.ts
    └── shared/
        └── logger/
            ├── logger.module.ts
            └── logger.service.ts
```

---

## 6. Output & Generation Rules

1. **Zero Truncation:** Provide the **complete file contents** for every single file listed in the tree. No `// ... same as above`, no placeholder comments, and no omitted unit test cases.
2. **Deterministic Code:** Ensure all imports match exactly between files and the `package.json` dependencies.
3. **Runnable Deliverable:** Ensure running `npm install && npm run build && npm test && npm run test:e2e` succeeds with zero TypeScript, linting, or runtime errors.
3. **Output Format:**
   - Print the directory tree first.
   - Present each file in sequence using markdown codeblocks labeled with the exact file path (e.g. `### \`src/main.ts\``).
   - Conclude with quick-start instructions (`npm install`, `npm run start:dev`, `npm test`).

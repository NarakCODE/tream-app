import test from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { createApiClient, ApiError } from "./index.ts";

test("ApiClient - successful request parses valid response", async () => {
  const userSchema = z.object({
    id: z.string(),
    name: z.string(),
  });

  const mockFetch: typeof fetch = async (input, init) => {
    assert.strictEqual(input, "https://api.example.com/users/1");
    assert.strictEqual(init?.method, "GET");
    return new Response(JSON.stringify({ id: "1", name: "Alice" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  const user = await client.get("/users/1", userSchema);
  assert.deepStrictEqual(user, { id: "1", name: "Alice" });
});

test("ApiClient - POST request serializes body and sets Content-Type", async () => {
  const responseSchema = z.object({ success: z.boolean() });

  const mockFetch: typeof fetch = async (input, init) => {
    assert.strictEqual(init?.method, "POST");
    assert.strictEqual(init?.body, JSON.stringify({ name: "Bob" }));
    const headers = new Headers(init?.headers);
    assert.strictEqual(headers.get("Content-Type"), "application/json");
    return new Response(JSON.stringify({ success: true }), { status: 201 });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  const result = await client.post("/users", responseSchema, { name: "Bob" });
  assert.deepStrictEqual(result, { success: true });
});

test("ApiClient - non-2xx error mapping extracts status, code, and message", async () => {
  const schema = z.object({ id: z.string() });

  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        code: "VALIDATION_FAILED",
        message: "Name is required",
        details: { field: "name" },
      }),
      {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  await assert.rejects(
    async () => {
      await client.get("/test", schema);
    },
    (err: any) => {
      assert(err instanceof ApiError, "Expected ApiError");
      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.code, "VALIDATION_FAILED");
      assert.strictEqual(err.message, "Name is required");
      assert.deepStrictEqual(err.details, {
        code: "VALIDATION_FAILED",
        message: "Name is required",
        details: { field: "name" },
      });
      return true;
    },
  );
});

test("ApiClient - non-2xx error mapping with array message (NestJS style)", async () => {
  const schema = z.object({ id: z.string() });

  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        statusCode: 422,
        error: "Unprocessable Entity",
        message: ["title should not be empty", "teamId must be a string"],
      }),
      {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  await assert.rejects(
    async () => {
      await client.get("/test", schema);
    },
    (err: any) => {
      assert(err instanceof ApiError, "Expected ApiError");
      assert.strictEqual(err.status, 422);
      assert.strictEqual(err.code, "Unprocessable Entity");
      assert.strictEqual(
        err.message,
        "title should not be empty, teamId must be a string",
      );
      return true;
    },
  );
});

test("ApiClient - non-2xx text fallback error mapping", async () => {
  const schema = z.object({ id: z.string() });

  const mockFetch: typeof fetch = async () => {
    return new Response("Gateway Timeout from upstream server", {
      status: 504,
      statusText: "Gateway Timeout",
    });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  await assert.rejects(
    async () => {
      await client.get("/timeout", schema);
    },
    (err: any) => {
      assert(err instanceof ApiError);
      assert.strictEqual(err.status, 504);
      assert.strictEqual(err.code, "HTTP_504");
      assert.strictEqual(err.message, "Gateway Timeout from upstream server");
      return true;
    },
  );
});

test("ApiClient - validation failure throws ZodError on schema mismatch", async () => {
  const itemSchema = z.object({
    id: z.string(),
    count: z.number(),
  });

  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ id: "item-1", count: "not-a-number" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  await assert.rejects(
    async () => {
      await client.get("/items/1", itemSchema);
    },
    (err: any) => {
      assert(err instanceof z.ZodError, "Expected ZodError");
      assert.strictEqual(err.issues[0]?.path[0], "count");
      return true;
    },
  );
});

test("ApiClient - accepts AbortSignal and passes it to fetch", async () => {
  const schema = z.object({ ok: z.boolean() });
  const controller = new AbortController();

  let receivedSignal: AbortSignal | undefined;
  const mockFetch: typeof fetch = async (_input, init) => {
    receivedSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    fetchFn: mockFetch,
  });

  await client.get("/signal-test", schema, { signal: controller.signal });
  assert.strictEqual(receivedSignal, controller.signal);
});

test("ApiClient - forwards injected getHeaders and options headers", async () => {
  const schema = z.object({ ok: z.boolean() });

  let capturedHeaders: Headers | undefined;
  const mockFetch: typeof fetch = async (_input, init) => {
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    getHeaders: async () => ({
      cookie: "session_token=abc123xyz",
      "x-custom-tenant": "tenant-42",
    }),
    fetchFn: mockFetch,
  });

  await client.get("/headers-test", schema, {
    headers: { "x-request-id": "req-999" },
  });

  assert(capturedHeaders !== undefined);
  assert.strictEqual(capturedHeaders?.get("cookie"), "session_token=abc123xyz");
  assert.strictEqual(capturedHeaders?.get("x-custom-tenant"), "tenant-42");
  assert.strictEqual(capturedHeaders?.get("x-request-id"), "req-999");
  assert.strictEqual(capturedHeaders?.get("accept"), "application/json");
});

test("ApiClient - forwards credentials option", async () => {
  const schema = z.object({ ok: z.boolean() });

  let capturedCredentials: RequestCredentials | undefined;
  const mockFetch: typeof fetch = async (_input, init) => {
    capturedCredentials = init?.credentials;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const client = createApiClient({
    baseUrl: "https://api.example.com",
    credentials: "include",
    fetchFn: mockFetch,
  });

  await client.get("/cred-test", schema);
  assert.strictEqual(capturedCredentials, "include");
});

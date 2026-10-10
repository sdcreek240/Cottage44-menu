import assert from "node:assert/strict";
import test from "node:test";
import { getBusinessDate } from "../functions/_shared/business-date.ts";
import {
  readSupabaseConfig,
  type Env,
} from "../functions/_shared/config.ts";
import { onRequest as healthHandler } from "../functions/api/health.ts";
import { handleTodayRequest } from "../functions/api/plates/today.ts";

const env: Env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
};

function request(method = "GET"): Request {
  return new Request("https://menu.example/api/plates/today", { method });
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

// A valid plate record for the Supabase response shape (snake_case).
function validRow(serviceDate: string, overrides: Record<string, unknown> = {}) {
  return {
    service_date: serviceDate,
    plate: {
      id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
      name: "Cottage burger",
      description: "Beef, cheese and chips",
      price_cents: 12500,
      image_url:
        "https://example.supabase.co/storage/v1/object/public/cottage44-plates/8d2b48f2-7932-4ff0-9e80-7ac5efc438f0.jpg",
      ...overrides,
    },
  };
}

// A valid plate object for the endpoint's response shape (camelCase).
function expectedPlate(serviceDate: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
    serviceDate,
    name: "Cottage burger",
    description: "Beef, cheese and chips",
    priceCents: 12500,
    imageUrl:
      "https://example.supabase.co/storage/v1/object/public/cottage44-plates/8d2b48f2-7932-4ff0-9e80-7ac5efc438f0.jpg",
    ...overrides,
  };
}

// Wednesday 2026-10-07 SAST. Tomorrow (Thu 10-08) and Fri 10-09 are workdays.
const WEDNESDAY = new Date("2026-10-06T22:00:00.000Z");
// Friday 2026-10-09 SAST. Bridges to next week's Mon-Fri.
const FRIDAY = new Date("2026-10-09T12:00:00.000Z");
// Saturday 2026-10-10 SAST.
const SATURDAY = new Date("2026-10-10T12:00:00.000Z");
// Sunday 2026-10-11 SAST.
const SUNDAY = new Date("2026-10-11T12:00:00.000Z");

test("health handler returns a no-store success response", async () => {
  const response = await healthHandler({
    request: new Request("https://menu.example/api/health"),
    env: {},
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("health and plate handlers reject non-GET requests", async () => {
  const healthResponse = await healthHandler({
    request: new Request("https://menu.example/api/health", { method: "POST" }),
    env: {},
  });
  const plateResponse = await handleTodayRequest(request("POST"), env);

  assert.equal(healthResponse.status, 405);
  assert.equal(plateResponse.status, 405);
  assert.deepEqual(await plateResponse.json(), {
    error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
  });
});

test("business date follows South African midnight, not UTC midnight", () => {
  assert.equal(getBusinessDate(new Date("2026-10-06T21:59:59.000Z")), "2026-10-06");
  assert.equal(getBusinessDate(new Date("2026-10-06T22:00:00.000Z")), "2026-10-07");
  assert.throws(() => getBusinessDate(new Date("invalid")), RangeError);
});

test("configuration accepts only HTTPS URLs and publishable keys", () => {
  assert.deepEqual(readSupabaseConfig(env), {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_value",
  });
  assert.throws(
    () =>
      readSupabaseConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "service_role_secret",
      }),
    /missing or invalid/,
  );
  assert.throws(
    () =>
      readSupabaseConfig({
        SUPABASE_URL: "not a URL",
        SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
      }),
    /missing or invalid/,
  );
  assert.throws(
    () =>
      readSupabaseConfig({
        SUPABASE_URL: "http://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
      }),
    /missing or invalid/,
  );
});

// ---------------------------------------------------------------------------
// Query window
// ---------------------------------------------------------------------------

test("today query scopes Supabase to the Johannesburg workday window and returns empty slots", async () => {
  let requestedUrl: URL | undefined;
  let requestedHeaders: Headers | undefined;
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    fetchImpl: async (input, init) => {
      requestedUrl = new URL(input.toString());
      requestedHeaders = new Headers(init?.headers);
      return jsonResponse([]);
    },
  });

  assert.equal(response.status, 200);
  // Wednesday 2026-10-07 → today + Thu 10-08 + Fri 10-09.
  assert.deepEqual(await response.json(), {
    plate: null,
    upcoming: [
      { serviceDate: "2026-10-08", plate: null },
      { serviceDate: "2026-10-09", plate: null },
    ],
  });
  assert.equal(
    requestedUrl?.searchParams.getAll("service_date").join(","),
    "gte.2026-10-07,lte.2026-10-09",
  );
  assert.equal(requestedUrl?.searchParams.get("limit"), "3");
  assert.equal(
    requestedUrl?.searchParams.get("select"),
    "service_date,plate:plates(id,name,description,price_cents,image_url)",
  );
  assert.equal(requestedUrl?.searchParams.get("order"), "service_date.asc");
  assert.equal(requestedHeaders?.get("apikey"), env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(requestedHeaders?.has("authorization"), false);
});

test("Friday query bridges the weekend and includes next week's five workdays", async () => {
  let requestedUrl: URL | undefined;
  const response = await handleTodayRequest(request(), env, {
    now: FRIDAY,
    fetchImpl: async (input) => {
      requestedUrl = new URL(input.toString());
      return jsonResponse([]);
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    plate: null,
    upcoming: [
      { serviceDate: "2026-10-12", plate: null },
      { serviceDate: "2026-10-13", plate: null },
      { serviceDate: "2026-10-14", plate: null },
      { serviceDate: "2026-10-15", plate: null },
      { serviceDate: "2026-10-16", plate: null },
    ],
  });
  // Query range spans Friday through the following Friday.
  assert.equal(
    requestedUrl?.searchParams.getAll("service_date").join(","),
    "gte.2026-10-09,lte.2026-10-16",
  );
  assert.equal(requestedUrl?.searchParams.get("limit"), "6");
});

test("Saturday query skips today and returns next week's five workdays", async () => {
  const response = await handleTodayRequest(request(), env, {
    now: SATURDAY,
    fetchImpl: async () => jsonResponse([]),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    plate: null,
    upcoming: [
      { serviceDate: "2026-10-12", plate: null },
      { serviceDate: "2026-10-13", plate: null },
      { serviceDate: "2026-10-14", plate: null },
      { serviceDate: "2026-10-15", plate: null },
      { serviceDate: "2026-10-16", plate: null },
    ],
  });
});

test("Sunday query skips today and returns next week's five workdays", async () => {
  const response = await handleTodayRequest(request(), env, {
    now: SUNDAY,
    fetchImpl: async () => jsonResponse([]),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.plate, null);
  assert.deepEqual(
    body.upcoming.map((slot: { serviceDate: string }) => slot.serviceDate),
    ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  );
});

// ---------------------------------------------------------------------------
// Sanitising and shaping the response
// ---------------------------------------------------------------------------

test("today handler allow-lists and sanitizes a valid database plate", async () => {
  const serviceDate = "2026-10-07";
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    fetchImpl: async () =>
      jsonResponse([
        {
          service_date: serviceDate,
          private_column: "must not escape",
          plate: {
            id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "  Cottage burger  ",
            description: "Beef, cheese and chips",
            price_cents: 12500,
            image_url:
              "https://example.supabase.co/storage/v1/object/public/cottage44-plates/8d2b48f2-7932-4ff0-9e80-7ac5efc438f0.jpg",
            private_column: "must not escape",
          },
        },
      ]),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    plate: expectedPlate(serviceDate),
    upcoming: [
      { serviceDate: "2026-10-08", plate: null },
      { serviceDate: "2026-10-09", plate: null },
    ],
  });
});

test("today handler places a validated tomorrow plate in the first upcoming slot", async () => {
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    fetchImpl: async () =>
      jsonResponse([
        {
          service_date: "2026-10-08",
          plate: {
            id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "Tomorrow stew",
            description: "Beef and vegetables",
            price_cents: 12500,
            image_url: null,
          },
        },
      ]),
  });

  assert.deepEqual(await response.json(), {
    plate: null,
    upcoming: [
      {
        serviceDate: "2026-10-08",
        plate: {
          id: "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
          serviceDate: "2026-10-08",
          name: "Tomorrow stew",
          description: "Beef and vegetables",
          priceCents: 12500,
          imageUrl: null,
        },
      },
      { serviceDate: "2026-10-09", plate: null },
    ],
  });
});

test("today handler fills multiple upcoming slots when several plates are scheduled", async () => {
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    fetchImpl: async () =>
      jsonResponse([
        validRow("2026-10-08", { name: "Thursday stew" }),
        validRow("2026-10-09", { name: "Friday stew" }),
      ]),
  });

  const body = await response.json();
  assert.equal(body.plate, null);
  assert.equal(body.upcoming.length, 2);
  assert.equal(body.upcoming[0].plate.name, "Thursday stew");
  assert.equal(body.upcoming[1].plate.name, "Friday stew");
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

test("today handler returns a safe error for invalid database data", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    logger: { error: (...values) => logs.push(values) },
    fetchImpl: async () =>
      jsonResponse([
        {
          service_date: "2026-10-07",
          plate: {
            id: "not-a-uuid",
            name: "<script>unsafe</script>",
            description: "invalid",
            price_cents: -1,
            image_url: "javascript:alert(1)",
          },
        },
      ]),
  });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(body, {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Today's plate is temporarily unavailable.",
    },
  });
  assert.match(String(logs[0]?.[0]), /invalid schema/);
});

test("today handler rejects a row whose service_date is outside the allowed window", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    logger: { error: (...values) => logs.push(values) },
    fetchImpl: async () =>
      jsonResponse([validRow("2026-10-20")]),
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Today's plate is temporarily unavailable.",
    },
  });
  assert.match(String(logs[0]?.[0]), /invalid schema/);
});

test("today handler rejects duplicate service dates", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    logger: { error: (...values) => logs.push(values) },
    fetchImpl: async () =>
      jsonResponse([
        validRow("2026-10-07"),
        validRow("2026-10-07"),
      ]),
  });

  assert.equal(response.status, 502);
  assert.match(String(logs[0]?.[0]), /duplicate/);
});

test("today handler rejects an over-sized row count and malformed JSON", async () => {
  const overSized = await handleTodayRequest(request(), env, {
    now: WEDNESDAY,
    logger: { error: () => {} },
    fetchImpl: async () =>
      jsonResponse([
        validRow("2026-10-07"),
        validRow("2026-10-08"),
        validRow("2026-10-09"),
        validRow("2026-10-10"),
      ]),
  });
  const malformedJsonResponse = await handleTodayRequest(request(), env, {
    logger: { error: () => {} },
    fetchImpl: async () => new Response("not JSON"),
  });

  assert.equal(overSized.status, 502);
  assert.equal(malformedJsonResponse.status, 502);
  assert.deepEqual(await overSized.json(), {
    error: {
      code: "UPSTREAM_ERROR",
      message: "Today's plate is temporarily unavailable.",
    },
  });
});

test("missing configuration is logged without exposing values", async () => {
  const logs: unknown[][] = [];
  const response = await handleTodayRequest(
    request(),
    { SUPABASE_URL: "https://example.supabase.co" },
    { logger: { error: (...values) => logs.push(values) } },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "The service is temporarily unavailable.",
    },
  });
  assert.doesNotMatch(JSON.stringify(logs), /example\.supabase\.co|sb_publishable/);
});

test("upstream and network failures return safe errors without leaking details", async () => {
  for (const fetchImpl of [
    async () => jsonResponse({ secret: "response body" }, 500),
    async () => {
      throw new Error("request failed with sb_publishable_sensitive");
    },
    async () => {
      throw "unknown transport failure";
    },
  ]) {
    const logs: unknown[][] = [];
    const response = await handleTodayRequest(request(), env, {
      fetchImpl,
      logger: { error: (...values) => logs.push(values) },
    });

    assert.equal(response.status, 502);
    assert.doesNotMatch(JSON.stringify(await response.json()), /secret|publishable/);
    assert.doesNotMatch(JSON.stringify(logs), /secret|publishable/);
  }
});
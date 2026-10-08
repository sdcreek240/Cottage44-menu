import assert from "node:assert/strict";
import test from "node:test";
import { OWNER_EMAIL, sessionCookie } from "../functions/_shared/admin.ts";
import { handleAdminMenuItemRequest } from "../functions/api/admin/menu/[id].ts";
import { handleAdminMenuRequest } from "../functions/api/admin/menu.ts";
import { handleMenuRequest } from "../functions/api/menu.ts";
import type { Env } from "../functions/_shared/config.ts";

const env: Env = {
  SUPABASE_URL: "https://cottage44-test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_tests",
  ADMIN_SITE_URL: "https://menu.example",
};
const itemId = "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: "Loaded fries",
    description: "Chips, cheese sauce, cheese and bacon",
    price_cents: 3800,
    category: "Lunch",
    category_order: 2,
    item_order: 4,
    active: true,
    created_at: "2026-10-07T10:00:00.000Z",
    updated_at: "2026-10-07T10:00:00.000Z",
    ...overrides,
  };
}

function adminRequest(
  path: string,
  method = "GET",
  body?: unknown,
  includeCookie = true,
  includeOrigin = true,
): Request {
  const url = `https://menu.example${path}`;
  const headers = new Headers();
  if (includeCookie) {
    const cookie = sessionCookie(new Request(url), {
      accessToken: "access-test-token",
      refreshToken: "refresh-test-token",
      rememberMe: false,
    });
    headers.set("Cookie", cookie.split(";")[0]);
  }
  if (includeOrigin) {
    headers.set("Origin", "https://menu.example");
  }
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return new Request(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("public menu retrieval returns database items grouped in database order", async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const response = await handleMenuRequest(
    new Request("https://menu.example/api/menu"),
    env,
    {
      fetchImpl: async (input, init) => {
        calls.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
        return Response.json([
          row({ name: "Toastie", description: "", category: "Toasties", category_order: 0, item_order: 0 }),
          row({ id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f0", name: "Loaded fries", category: "Lunch", category_order: 2, item_order: 4 }),
          row({ id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f1", name: "Russian", description: "", category: "Lunch", category_order: 2, item_order: 5 }),
        ]);
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    categories: [
      {
        category: "Toasties",
        items: [{
          id: itemId,
          name: "Toastie",
          priceCents: 3800,
          description: "",
        }],
      },
      {
        category: "Lunch",
        items: [
          {
            id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "Loaded fries",
            priceCents: 3800,
            description: "Chips, cheese sauce, cheese and bacon",
          },
          {
            id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f1",
            name: "Russian",
            priceCents: 3800,
            description: "",
          },
        ],
      },
    ],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/rest/v1/menu_items");
  assert.equal(calls[0].url.searchParams.get("active"), "eq.true");
  assert.equal(calls[0].url.searchParams.get("order"), "category_order.asc,item_order.asc,id.asc");
  assert.equal(calls[0].headers.get("apikey"), env.SUPABASE_PUBLISHABLE_KEY);
});

test("public menu API rejects other methods and malformed upstream menu data", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return Response.json([row({ price_cents: "38" })]);
  };
  const methodResponse = await handleMenuRequest(
    new Request("https://menu.example/api/menu", { method: "POST" }),
    env,
    { fetchImpl },
  );
  const invalidResponse = await handleMenuRequest(
    new Request("https://menu.example/api/menu"),
    env,
    { fetchImpl },
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(invalidResponse.status, 502);
  assert.equal(fetchCalls, 1);
});

test("admin menu routes require the owner session and same-origin mutations", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ email: OWNER_EMAIL });
  };
  const unauthorized = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "GET", undefined, false),
    env,
    { fetchImpl },
  );
  const crossOrigin = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "POST", {
      name: "Test", description: "", priceCents: 100, category: "Test",
      categoryOrder: 0, itemOrder: 0, active: true,
    }, true, false),
    env,
    { fetchImpl },
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(crossOrigin.status, 403);
  assert.equal(calls, 0);
});

test("admin menu API validates input and supports read, create, edit, deactivate, restore, and delete", async () => {
  let stored = row({ seed_key: null });
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Response.json({ email: OWNER_EMAIL });
    }
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === "/rest/v1/menu_items") {
      if (method === "GET") {
        return Response.json([stored]);
      }
      if (method === "POST") {
        stored = row({
          ...body,
          id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f1",
          created_at: "2026-10-08T10:00:00.000Z",
          updated_at: "2026-10-08T10:00:00.000Z",
        });
        return Response.json([stored], { status: 201 });
      }
    }
    if (url.pathname === `/rest/v1/menu_items` && url.searchParams.get("id") === `eq.${itemId}`) {
      if (method === "PATCH") {
        stored = row({ ...body });
        return Response.json([stored]);
      }
      if (method === "DELETE") {
        return Response.json([{ id: itemId }]);
      }
    }
    throw new Error(`Unexpected mock request: ${method} ${url}`);
  };

  const readResponse = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu"),
    env,
    { fetchImpl },
  );
  const readResult = await readResponse.json();
  assert.equal(readResponse.status, 200);
  assert.equal(readResult.items[0].category, "Lunch");
  assert.equal(readResult.items[0].priceCents, 3800);

  const invalidCreate = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "POST", {
      name: " ", description: "", priceCents: -1, category: "",
      categoryOrder: 0, itemOrder: 0, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(invalidCreate.status, 400);
  assert.equal(requests.length, 1, "invalid input never reaches the database");

  const createResponse = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "POST", {
      name: "New item", description: "Details", priceCents: 1250,
      category: "Specials", categoryOrder: 6, itemOrder: 0, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(createResponse.status, 201);
  assert.equal(requests.at(-1)?.method, "POST");
  const createBody = requests.at(-1)?.body;
  assert.equal(
    typeof createBody === "object" && createBody !== null && "price_cents" in createBody
      ? createBody.price_cents
      : undefined,
    1250,
  );

  for (const active of [false, true]) {
    const updateResponse = await handleAdminMenuItemRequest(
      adminRequest(`/api/admin/menu/${itemId}`, "PATCH", {
        name: "Loaded fries updated",
        description: "Updated details",
        priceCents: 3900,
        category: "Lunch",
        categoryOrder: 2,
        itemOrder: 4,
        active,
      }),
      env,
      itemId,
      { fetchImpl },
    );
    const result = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(result.item.active, active);
    const updateBody = requests.at(-1)?.body;
    assert.equal(
      typeof updateBody === "object" && updateBody !== null && "active" in updateBody
        ? updateBody.active
        : undefined,
      active,
    );
  }

  const deleteResponse = await handleAdminMenuItemRequest(
    adminRequest(`/api/admin/menu/${itemId}`, "DELETE"),
    env,
    itemId,
    { fetchImpl },
  );
  assert.deepEqual(await deleteResponse.json(), { deleted: true });
  assert.equal(requests.at(-1)?.method, "DELETE");
});

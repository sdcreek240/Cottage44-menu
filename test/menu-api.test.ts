import assert from "node:assert/strict";
import test from "node:test";
import { OWNER_EMAIL, sessionCookie } from "../functions/_shared/admin.ts";
import { handleAdminMenuItemRequest } from "../functions/api/admin/menu/[id].ts";
import { handleMenuCategoryRequest } from "../functions/api/admin/menu/categories/[id].ts";
import { handleMenuCategoriesRequest } from "../functions/api/admin/menu/categories.ts";
import { handleAdminMenuRequest } from "../functions/api/admin/menu.ts";
import { handleMenuRequest } from "../functions/api/menu.ts";
import type { Env } from "../functions/_shared/config.ts";

const env: Env = {
  SUPABASE_URL: "https://cottage44-test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_tests",
  ADMIN_SITE_URL: "https://menu.example",
};
const categoryId = "20000000-0000-4000-8000-000000000001";
const itemId = "8d2b48f2-7932-4ff0-9e80-7ac5efc438f0";

function categoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: categoryId,
    name: "Lunch",
    category_order: 2,
    active: true,
    created_at: "2026-10-07T10:00:00.000Z",
    updated_at: "2026-10-07T10:00:00.000Z",
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    name: "Loaded fries",
    description: "Chips, cheese sauce, cheese and bacon",
    price_cents: 3800,
    category_id: categoryId,
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

test("public menu retrieval returns database categories and assigned items in database order", async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const response = await handleMenuRequest(
    new Request("https://menu.example/api/menu"),
    env,
    {
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        calls.push({ url, headers: new Headers(init?.headers) });
        return url.pathname.endsWith("/menu_categories")
          ? Response.json([
            categoryRow({ id: "20000000-0000-4000-8000-000000000002", name: "Toasties", category_order: 0 }),
            categoryRow(),
          ])
          : Response.json([
            itemRow({ name: "Second lunch", item_order: 5 }),
            itemRow({ id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f0", name: "First lunch", item_order: 4 }),
          ]);
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    categories: [
      {
        category: "Lunch",
        items: [
          {
            id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f0",
            name: "First lunch",
            priceCents: 3800,
            description: "Chips, cheese sauce, cheese and bacon",
          },
          {
            id: itemId,
            name: "Second lunch",
            priceCents: 3800,
            description: "Chips, cheese sauce, cheese and bacon",
          },
        ],
      },
    ],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, "/rest/v1/menu_categories");
  assert.equal(calls[0].url.searchParams.get("active"), "eq.true");
  assert.equal(calls[0].url.searchParams.get("order"), "category_order.asc,id.asc");
  assert.equal(calls[1].url.pathname, "/rest/v1/menu_items");
  assert.equal(calls[1].url.searchParams.get("category_id"), "in.(20000000-0000-4000-8000-000000000002,20000000-0000-4000-8000-000000000001)");
  assert.equal(calls[1].url.searchParams.get("order"), "category_id.asc,item_order.asc,id.asc");
  assert.equal(calls[0].headers.get("apikey"), env.SUPABASE_PUBLISHABLE_KEY);
});

test("public menu API rejects other methods and malformed upstream category or item data", async () => {
  let fetchCalls = 0;
  const fetchImpl = async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    return String(input).includes("menu_categories")
      ? Response.json([categoryRow()])
      : Response.json([itemRow({ price_cents: "38" })]);
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
  assert.equal(fetchCalls, 2);
});

test("admin menu endpoints require the owner session and same-origin mutations", async () => {
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
      name: "Test", description: "", priceCents: 100,
      categoryId, itemOrder: 0, active: true,
    }, true, false),
    env,
    { fetchImpl },
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(crossOrigin.status, 403);
  assert.equal(calls, 0);
});

test("admin menu API loads categories and items and validates item CRUD", async () => {
  let storedItem = itemRow();
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Response.json({ email: OWNER_EMAIL });
    }
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.pathname === "/rest/v1/menu_categories") {
      return Response.json([categoryRow()]);
    }
    if (url.pathname === "/rest/v1/menu_items") {
      if (method === "GET") {
        return Response.json([storedItem]);
      }
      if (method === "POST") {
        storedItem = itemRow({
          ...body,
          id: "9d2b48f2-7932-4ff0-9e80-7ac5efc438f1",
          created_at: "2026-10-08T10:00:00.000Z",
          updated_at: "2026-10-08T10:00:00.000Z",
        });
        return Response.json([storedItem], { status: 201 });
      }
    }
    if (url.pathname === "/rest/v1/menu_items" && url.searchParams.get("id") === `eq.${itemId}`) {
      if (method === "PATCH") {
        storedItem = itemRow({ ...body });
        return Response.json([storedItem]);
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
  assert.equal(readResult.categories[0].name, "Lunch");
  assert.equal(readResult.items[0].categoryId, categoryId);
  assert.equal(readResult.items[0].priceCents, 3800);

  const invalidCreate = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "POST", {
      name: " ", description: "", priceCents: -1,
      categoryId: "invalid", itemOrder: 0, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(invalidCreate.status, 400);
  assert.equal(requests.length, 2, "invalid input never reaches item writes");

  const createResponse = await handleAdminMenuRequest(
    adminRequest("/api/admin/menu", "POST", {
      name: "New item", description: "Details", priceCents: 1250,
      categoryId, itemOrder: 0, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(createResponse.status, 201);
  assert.equal(requests.at(-1)?.method, "POST");
  const createBody = requests.at(-1)?.body;
  assert.equal(
    typeof createBody === "object" && createBody !== null && "category_id" in createBody
      ? createBody.category_id
      : undefined,
    categoryId,
  );

  const updateResponse = await handleAdminMenuItemRequest(
    adminRequest(`/api/admin/menu/${itemId}`, "PATCH", {
      name: "Loaded fries updated",
      description: "Updated details",
      priceCents: 3900,
      categoryId,
      itemOrder: 4,
      active: false,
    }),
    env,
    itemId,
    { fetchImpl },
  );
  const updateResult = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updateResult.item.active, false);
  const updateBody = requests.at(-1)?.body;
  assert.equal(
    typeof updateBody === "object" && updateBody !== null && "category_id" in updateBody
      ? updateBody.category_id
      : undefined,
    categoryId,
  );

  const deleteResponse = await handleAdminMenuItemRequest(
    adminRequest(`/api/admin/menu/${itemId}`, "DELETE"),
    env,
    itemId,
    { fetchImpl },
  );
  assert.deepEqual(await deleteResponse.json(), { deleted: true });
  assert.equal(requests.at(-1)?.method, "DELETE");
});

test("admin category API supports create, update, safe delete, and empty-category deletion", async () => {
  const calls: Array<{ url: URL; method: string; body: unknown }> = [];
  let assignedItems: unknown[] = [{ id: itemId }];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Response.json({ email: OWNER_EMAIL });
    }
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.pathname.endsWith("/menu_items")) {
      return Response.json(assignedItems);
    }
    if (method === "DELETE") {
      return Response.json([{ id: categoryId }]);
    }
    return Response.json([categoryRow({ ...body })], { status: method === "POST" ? 201 : 200 });
  };

  const invalid = await handleMenuCategoriesRequest(
    adminRequest("/api/admin/menu/categories", "POST", {
      name: "", categoryOrder: -1, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);

  const created = await handleMenuCategoriesRequest(
    adminRequest("/api/admin/menu/categories", "POST", {
      name: " Specials ", categoryOrder: 6, active: true,
    }),
    env,
    { fetchImpl },
  );
  assert.equal(created.status, 201);
  assert.deepEqual((await created.json()).category, {
    id: categoryId,
    name: "Specials",
    categoryOrder: 6,
    active: true,
  });
  assert.deepEqual(calls.at(-1)?.body, {
    name: "Specials",
    category_order: 6,
    active: true,
  });

  const updated = await handleMenuCategoryRequest(
    adminRequest(`/api/admin/menu/categories/${categoryId}`, "PATCH", {
      name: "Lunch", categoryOrder: 3, active: false,
    }),
    env,
    categoryId,
    { fetchImpl },
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).category.active, false);
  assert.equal(calls.at(-1)?.method, "PATCH");

  const rejected = await handleMenuCategoryRequest(
    adminRequest(`/api/admin/menu/categories/${categoryId}`, "DELETE"),
    env,
    categoryId,
    { fetchImpl },
  );
  assert.equal(rejected.status, 409);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 0);

  assignedItems = [];
  const deleted = await handleMenuCategoryRequest(
    adminRequest(`/api/admin/menu/categories/${categoryId}`, "DELETE"),
    env,
    categoryId,
    { fetchImpl },
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal(calls.at(-1)?.method, "DELETE");
});

test("admin category mutations reject cross-origin writes and invalid category IDs", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ email: OWNER_EMAIL });
  };
  const crossOrigin = await handleMenuCategoriesRequest(
    adminRequest("/api/admin/menu/categories", "POST", {}, true, false),
    env,
    { fetchImpl },
  );
  const invalidId = await handleMenuCategoryRequest(
    adminRequest("/api/admin/menu/categories/nope", "DELETE"),
    env,
    "nope",
    { fetchImpl },
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal(invalidId.status, 404);
  assert.equal(calls, 0);
});

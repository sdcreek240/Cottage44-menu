import assert from "node:assert/strict";
import test from "node:test";
import type { AdminApiContext } from "../functions/_shared/admin-api.ts";
import {
  isMenuCategory,
  isMenuItem,
  loadAdminMenu,
  loadPublicMenu,
  MenuServiceError,
  menuCategoryFields,
  menuItemFields,
  removeAdminMenuCategory,
  removeAdminMenuItem,
  saveAdminRow,
} from "../functions/_shared/menu-service.ts";

const config = {
  url: "https://cottage44-test.supabase.co",
  publishableKey: "sb_publishable_fake_for_tests",
};
const categoryId = "20000000-0000-4000-8000-000000000001";
const anotherCategoryId = "20000000-0000-4000-8000-000000000002";
const itemId = "10000000-0000-4000-8000-000000000001";

function category(overrides: Record<string, unknown> = {}) {
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

function item(overrides: Record<string, unknown> = {}) {
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

const adminContext: AdminApiContext = {
  config,
  session: {
    accessToken: "owner-access-token",
    refreshToken: "owner-refresh-token",
    rememberMe: false,
  },
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function adminFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  return {
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) =>
      await handler(new URL(String(input)), init),
    logger: { error() {} },
  };
}

test("menu validators accept complete rows and reject malformed, unsafe, and out-of-range data", () => {
  assert.equal(isMenuCategory(category()), true);
  assert.equal(isMenuCategory(null), false);
  assert.equal(isMenuCategory([]), false);
  assert.equal(isMenuCategory(category({ id: "bad" })), false);
  assert.equal(isMenuCategory(category({ name: " " })), false);
  assert.equal(isMenuCategory(category({ category_order: -1 })), false);
  assert.equal(isMenuCategory(category({ category_order: 1001 })), false);
  assert.equal(isMenuCategory(category({ active: 1 })), false);
  assert.equal(isMenuCategory(category({ created_at: undefined })), false);

  assert.equal(isMenuItem(item()), true);
  assert.equal(isMenuItem(null), false);
  assert.equal(isMenuItem(item({ price_cents: "38" })), false);
  assert.equal(isMenuItem(item({ price_cents: 100_000_001 })), false);
  assert.equal(isMenuItem(item({ category_id: "bad" })), false);
  assert.equal(isMenuItem(item({ item_order: 1.2 })), false);
  assert.equal(isMenuItem(item({ description: "x".repeat(1001) })), false);
  assert.equal(isMenuItem(item({ active: "true" })), false);
  assert.equal(isMenuItem(item({ updated_at: undefined })), false);
});

test("menu field parsers trim text and enforce numeric, identifier, and boolean rules", () => {
  assert.deepEqual(menuCategoryFields({
    name: "  Lunch  ",
    categoryOrder: 0,
    active: true,
  }), {
    name: "Lunch",
    category_order: 0,
    active: true,
  });
  assert.equal(menuCategoryFields(null), null);
  assert.equal(menuCategoryFields({
    name: " ".repeat(81),
    categoryOrder: 0,
    active: true,
  }), null);
  assert.equal(menuCategoryFields({
    name: "Lunch",
    categoryOrder: 1001,
    active: true,
  }), null);
  assert.equal(menuCategoryFields({
    name: "Lunch",
    categoryOrder: 0.5,
    active: true,
  }), null);
  assert.equal(menuCategoryFields({
    name: "Lunch",
    categoryOrder: 0,
    active: "yes",
  }), null);

  assert.deepEqual(menuItemFields({
    name: " Loaded fries ",
    description: " Description ",
    priceCents: 3800,
    categoryId,
    itemOrder: 0,
    active: true,
  }), {
    name: "Loaded fries",
    description: "Description",
    price_cents: 3800,
    category_id: categoryId,
    item_order: 0,
    active: true,
  });
  for (const invalid of [
    null,
    { name: "", description: "", priceCents: 1, categoryId, itemOrder: 0, active: true },
    { name: "x".repeat(121), description: "", priceCents: 1, categoryId, itemOrder: 0, active: true },
    { name: "x", description: "x".repeat(1001), priceCents: 1, categoryId, itemOrder: 0, active: true },
    { name: "x", description: "", priceCents: -1, categoryId, itemOrder: 0, active: true },
    { name: "x", description: "", priceCents: 100_000_001, categoryId, itemOrder: 0, active: true },
    { name: "x", description: "", priceCents: 1.5, categoryId, itemOrder: 0, active: true },
    { name: "x", description: "", priceCents: 1, categoryId: "bad", itemOrder: 0, active: true },
    { name: "x", description: "", priceCents: 1, categoryId, itemOrder: -1, active: true },
    { name: "x", description: "", priceCents: 1, categoryId, itemOrder: 10001, active: true },
    { name: "x", description: "", priceCents: 1, categoryId, itemOrder: 0, active: 1 },
  ]) {
    assert.equal(menuItemFields(invalid), null);
  }
});

test("public menu service filters inactive relationships and orders categories/items from database fields", async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const result = await loadPublicMenu(config, adminFetch((url, init) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    if (url.pathname.endsWith("/menu_categories")) {
      return response([
        category({ id: anotherCategoryId, name: "Breakfast", category_order: 5 }),
        category({ category_order: 2 }),
        category({ id: "20000000-0000-4000-8000-000000000003", name: "Hidden", category_order: 1, active: false }),
      ]);
    }
    return response([
      item({ id: "10000000-0000-4000-8000-000000000003", name: "Last lunch", item_order: 8 }),
      item({ id: "10000000-0000-4000-8000-000000000002", name: "First lunch", item_order: 1 }),
      item({ id: "10000000-0000-4000-8000-000000000005", name: "Inactive item", active: false }),
      item({ id: "10000000-0000-4000-8000-000000000006", name: "Breakfast special", category_id: anotherCategoryId, item_order: 0 }),
    ]);
  }));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("active"), "eq.true");
  assert.equal(calls[0].url.searchParams.get("order"), "category_order.asc,id.asc");
  assert.equal(calls[1].url.searchParams.get("category_id"), `in.(${anotherCategoryId},${categoryId})`);
  assert.equal(calls[1].url.searchParams.get("active"), "eq.true");
  assert.equal(calls[0].headers.get("apikey"), config.publishableKey);
  assert.deepEqual(result, [
    {
      category: "Lunch",
      categoryId,
      items: [
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "First lunch",
          priceCents: 3800,
          description: "Chips, cheese sauce, cheese and bacon",
        },
        {
          id: "10000000-0000-4000-8000-000000000003",
          name: "Last lunch",
          priceCents: 3800,
          description: "Chips, cheese sauce, cheese and bacon",
        },
      ],
    },
    {
      category: "Breakfast",
      categoryId: anotherCategoryId,
      items: [{
        id: "10000000-0000-4000-8000-000000000006",
        name: "Breakfast special",
        priceCents: 3800,
        description: "Chips, cheese sauce, cheese and bacon",
      }],
    },
  ]);
});

test("public menu returns empty without an item query when all categories are inactive", async () => {
  let calls = 0;
  const result = await loadPublicMenu(config, adminFetch(() => {
    calls += 1;
    return response([category({ active: false })]);
  }));
  assert.deepEqual(result, []);
  assert.equal(calls, 1);
});

test("public menu service reports network, HTTP, JSON, schema, and relationship failures", async () => {
  const failures: Array<(url: URL) => Response | Promise<Response>> = [
    () => { throw new Error("network"); },
    () => response([], 503),
    () => new Response("invalid", { headers: { "Content-Type": "application/json" } }),
    () => response([category({ category_order: 1.5 })]),
    (url) => url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : Promise.reject(new Error("item network")),
    (url) => url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : response([], 503),
    (url) => url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : new Response("invalid", { headers: { "Content-Type": "application/json" } }),
    (url) => url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : response([item({ price_cents: "38" })]),
    (url) => url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : response([item({ category_id: anotherCategoryId })]),
  ];
  for (const fetchMock of failures) {
    await assert.rejects(
      () => loadPublicMenu(config, adminFetch(fetchMock)),
      MenuServiceError,
    );
  }
});

test("public menu service uses stable IDs when category or item order values tie", async () => {
  const result = await loadPublicMenu(config, adminFetch((url) =>
    url.pathname.endsWith("/menu_categories")
      ? response([
        category({ id: anotherCategoryId, name: "Later ID", category_order: 2 }),
        category({ id: categoryId, name: "Earlier ID", category_order: 2 }),
      ])
      : response([
        item({ id: "10000000-0000-4000-8000-000000000002", name: "Later ID", item_order: 0 }),
        item({ id: "10000000-0000-4000-8000-000000000001", name: "Earlier ID", item_order: 0 }),
        item({
          id: "10000000-0000-4000-8000-000000000003",
          name: "Second category item",
          category_id: anotherCategoryId,
          item_order: 0,
        }),
      ])
  ));
  assert.deepEqual(result.map((group) => group.category), ["Earlier ID", "Later ID"]);
  assert.deepEqual(
    result[0].items.map((entry) => entry.name),
    ["Earlier ID", "Later ID"],
  );
});

test("admin menu service loads both tables and rejects a bad category or item response", async () => {
  const calls: URL[] = [];
  const result = await loadAdminMenu(adminContext, adminFetch((url) => {
    calls.push(url);
    return url.pathname.endsWith("/menu_categories")
      ? response([category()])
      : response([item()]);
  }));
  assert.equal(calls.length, 2);
  assert.ok(calls.some((url) => url.searchParams.get("order") === "category_order.asc,id.asc"));
  assert.ok(calls.some((url) => url.searchParams.get("order") === "category_id.asc,item_order.asc,id.asc"));
  assert.deepEqual(result, { categories: [category()], items: [item()] });

  await assert.rejects(
    () => loadAdminMenu(adminContext, adminFetch((url) =>
      url.pathname.endsWith("/menu_categories") ? response([], 503) : response([item()])
    )),
    /Menu category request failed/,
  );
  await assert.rejects(
    () => loadAdminMenu(adminContext, adminFetch(() => {
      throw new Error("network");
    })),
    /Menu category request failed/,
  );
  await assert.rejects(
    () => loadAdminMenu(adminContext, adminFetch((url) =>
      url.pathname.endsWith("/menu_categories") ? response([category()]) : response([{}])
    )),
    /Menu item database response was invalid/,
  );
});

test("admin menu save service maps and authenticates category/item writes", async () => {
  const categoryCalls: Array<{ url: URL; init?: RequestInit }> = [];
  const savedCategory = category();
  const result = await saveAdminRow(
    adminContext,
    "menu_categories",
    { name: "Lunch", category_order: 2, active: true },
    "POST",
    null,
    isMenuCategory,
    adminFetch((url, init) => {
      categoryCalls.push({ url, init });
      return response([savedCategory], 201);
    }),
  );
  assert.deepEqual(result, savedCategory);
  assert.match(categoryCalls[0].url.pathname, /menu_categories$/);
  assert.equal(categoryCalls[0].url.searchParams.get("select"), "id,name,category_order,active,created_at,updated_at");
  assert.equal(categoryCalls[0].init?.method, "POST");
  const writeHeaders = new Headers(categoryCalls[0].init?.headers);
  assert.equal(writeHeaders.get("Authorization"), "Bearer owner-access-token");
  assert.equal(writeHeaders.get("Prefer"), "return=representation");
  assert.equal(JSON.parse(String(categoryCalls[0].init?.body)).name, "Lunch");

  const updateUrls: URL[] = [];
  await saveAdminRow(
    adminContext,
    "menu_items",
    {
      name: "Loaded fries",
      description: "",
      price_cents: 3800,
      category_id: categoryId,
      item_order: 0,
      active: true,
    },
    "PATCH",
    itemId,
    isMenuItem,
    adminFetch((url) => {
      updateUrls.push(url);
      return response([item()]);
    }),
  );
  assert.equal(updateUrls[0].searchParams.get("id"), `eq.${itemId}`);
});

test("admin save service rejects transport, database, malformed, and missing-row responses", async () => {
  for (const fetchMock of [
    () => { throw new Error("transport"); },
    () => response([], 500),
    () => new Response("not-json", { headers: { "Content-Type": "application/json" } }),
    () => response([{}]),
    () => response([]),
    () => response([category(), category({ id: anotherCategoryId })]),
  ]) {
    await assert.rejects(
      () => saveAdminRow(
        adminContext,
        "menu_categories",
        { name: "Lunch", category_order: 2, active: true },
        "POST",
        null,
        isMenuCategory,
        adminFetch(fetchMock),
      ),
      MenuServiceError,
    );
  }
});

test("category delete rejects in-use categories without deleting and handles race-protected foreign keys", async () => {
  let deleteCalls = 0;
  const inUse = await removeAdminMenuCategory(
    adminContext,
    categoryId,
    adminFetch((url) => {
      if (url.pathname.endsWith("/menu_items")) {
        return response([{ id: itemId }]);
      }
      deleteCalls += 1;
      return response([{ id: categoryId }]);
    }),
  );
  assert.equal(inUse, "in_use");
  assert.equal(deleteCalls, 0);

  const raceProtected = await removeAdminMenuCategory(
    adminContext,
    categoryId,
    adminFetch((url) => url.pathname.endsWith("/menu_items")
      ? response([])
      : response({ message: "foreign key violation" }, 409)),
  );
  assert.equal(raceProtected, "in_use");

  const deleted = await removeAdminMenuCategory(
    adminContext,
    categoryId,
    adminFetch((url) => url.pathname.endsWith("/menu_items")
      ? response([])
      : response([{ id: categoryId }])),
  );
  assert.equal(deleted, "deleted");

  const absent = await removeAdminMenuCategory(
    adminContext,
    categoryId,
    adminFetch((url) => url.pathname.endsWith("/menu_items")
      ? response([])
      : response([])),
  );
  assert.equal(absent, "not_found");
});

test("category deletion surfaces lookup, malformed, and non-conflict delete failures", async () => {
  await assert.rejects(
    () => removeAdminMenuCategory(adminContext, categoryId, adminFetch(() => {
      throw new Error("network");
    })),
    MenuServiceError,
  );
  await assert.rejects(
    () => removeAdminMenuCategory(
      adminContext,
      categoryId,
      adminFetch((url) => url.pathname.endsWith("/menu_items")
        ? response({}, 200)
        : response([])),
    ),
    /Menu category assignment database response was invalid/,
  );
  await assert.rejects(
    () => removeAdminMenuCategory(
      adminContext,
      categoryId,
      adminFetch((url) => url.pathname.endsWith("/menu_items")
        ? response([])
        : response({}, 500)),
    ),
    /Menu category deletion failed/,
  );
  await assert.rejects(
    () => removeAdminMenuCategory(
      adminContext,
      categoryId,
      adminFetch((url) => url.pathname.endsWith("/menu_items")
        ? response([])
        : new Response("invalid", { headers: { "Content-Type": "application/json" } })),
    ),
    /menu category deletion database response was invalid/,
  );
});

test("item deletion distinguishes a removed record from a missing one and rejects errors", async () => {
  assert.equal(await removeAdminMenuItem(
    adminContext,
    itemId,
    adminFetch(() => response([{ id: itemId }])),
  ), true);
  assert.equal(await removeAdminMenuItem(
    adminContext,
    itemId,
    adminFetch(() => response([])),
  ), false);
  await assert.rejects(
    () => removeAdminMenuItem(adminContext, itemId, adminFetch(() => response([], 500))),
    /Menu item deletion failed/,
  );
  await assert.rejects(
    () => removeAdminMenuItem(
      adminContext,
      itemId,
      adminFetch(() => new Response("invalid", { headers: { "Content-Type": "application/json" } })),
    ),
    /menu item deletion database response was invalid/,
  );
  await assert.rejects(
    () => removeAdminMenuItem(
      adminContext,
      itemId,
      adminFetch(() => response({ id: itemId })),
    ),
    /menu item deletion response was invalid/,
  );
});

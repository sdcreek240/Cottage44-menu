import {
  adminSupabaseFetch,
  type AdminApiContext,
} from "./admin-api.ts";
import type { AdminDependencies } from "./admin.ts";
import type { SupabaseConfig } from "./config.ts";

export type MenuCategory = {
  id: string;
  name: string;
  category_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category_id: string;
  item_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuItemFields = Omit<MenuItem, "id" | "created_at" | "updated_at">;
export type MenuCategoryFields = Omit<MenuCategory, "id" | "created_at" | "updated_at">;

export class MenuServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMenuCategory(value: unknown): value is MenuCategory {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 80 &&
    typeof value.category_order === "number" &&
    Number.isSafeInteger(value.category_order) &&
    value.category_order >= 0 &&
    value.category_order <= 1000 &&
    typeof value.active === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string";
}

export function isMenuItem(value: unknown): value is MenuItem {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 120 &&
    typeof value.description === "string" &&
    value.description.length <= 1000 &&
    typeof value.price_cents === "number" &&
    Number.isSafeInteger(value.price_cents) &&
    value.price_cents >= 0 &&
    value.price_cents <= 100_000_000 &&
    typeof value.category_id === "string" &&
    UUID_PATTERN.test(value.category_id) &&
    typeof value.item_order === "number" &&
    Number.isSafeInteger(value.item_order) &&
    value.item_order >= 0 &&
    value.item_order <= 10000 &&
    typeof value.active === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string";
}

export function menuItemFields(value: unknown): MenuItemFields | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.trim().length > 120 ||
    typeof value.description !== "string" ||
    value.description.length > 1000 ||
    typeof value.priceCents !== "number" ||
    !Number.isSafeInteger(value.priceCents) ||
    value.priceCents < 0 ||
    value.priceCents > 100_000_000 ||
    typeof value.categoryId !== "string" ||
    !UUID_PATTERN.test(value.categoryId) ||
    typeof value.itemOrder !== "number" ||
    !Number.isSafeInteger(value.itemOrder) ||
    value.itemOrder < 0 ||
    value.itemOrder > 10000 ||
    typeof value.active !== "boolean"
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    price_cents: value.priceCents,
    category_id: value.categoryId,
    item_order: value.itemOrder,
    active: value.active,
  };
}

export function menuCategoryFields(value: unknown): MenuCategoryFields | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.trim().length > 80 ||
    typeof value.categoryOrder !== "number" ||
    !Number.isSafeInteger(value.categoryOrder) ||
    value.categoryOrder < 0 ||
    value.categoryOrder > 1000 ||
    typeof value.active !== "boolean"
  ) {
    return null;
  }
  return {
    name: value.name.trim(),
    category_order: value.categoryOrder,
    active: value.active,
  };
}

function sortedGroups(
  categories: MenuCategory[],
  items: MenuItem[],
): Array<{
  category: string;
  categoryId: string;
  items: Array<{ id: string; name: string; priceCents: number; description: string }>;
}> {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<string, {
    category: MenuCategory;
    items: MenuItem[];
  }>();
  for (const category of categories) {
    if (category.active) {
      groups.set(category.id, { category, items: [] });
    }
  }
  for (const item of items) {
    if (!categoryById.has(item.category_id)) {
      throw new MenuServiceError("Menu item references an unknown category.");
    }
    const group = groups.get(item.category_id);
    if (group && item.active) {
      group.items.push(item);
    }
  }
  return [...groups.values()]
    .filter(({ items: rows }) => rows.length > 0)
    .sort((left, right) =>
      left.category.category_order - right.category.category_order ||
      left.category.id.localeCompare(right.category.id)
    )
    .map(({ category, items: rows }) => ({
      category: category.name,
      categoryId: category.id,
      items: rows
        .sort((left, right) =>
          left.item_order - right.item_order || left.id.localeCompare(right.id)
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          priceCents: item.price_cents,
          description: item.description,
        })),
    }));
}

function requireRows<T>(
  value: unknown,
  validate: (row: unknown) => row is T,
  label: string,
): T[] {
  if (!Array.isArray(value) || value.length > 500 || !value.every(validate)) {
    throw new MenuServiceError(`The ${label} database response was invalid.`);
  }
  return value;
}

async function readJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new MenuServiceError(`The ${label} database response was invalid.`);
  }
}

export async function loadPublicMenu(
  config: SupabaseConfig,
  dependencies: Pick<AdminDependencies, "fetchImpl"> = {},
): Promise<ReturnType<typeof sortedGroups>> {
  const headers = { apikey: config.publishableKey, Accept: "application/json" };
  const categoryUrl = new URL(`${config.url}/rest/v1/menu_categories`);
  categoryUrl.searchParams.set(
    "select",
    "id,name,category_order,active,created_at,updated_at",
  );
  categoryUrl.searchParams.set("active", "eq.true");
  categoryUrl.searchParams.set("order", "category_order.asc,id.asc");
  categoryUrl.searchParams.set("limit", "500");

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let categoryResponse: Response;
  try {
    categoryResponse = await fetchImpl(categoryUrl, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new MenuServiceError("The menu database request failed.");
  }
  if (!categoryResponse.ok) {
    throw new MenuServiceError("The menu database request failed.");
  }
  const categories = requireRows(
    await readJson(categoryResponse, "menu category"),
    isMenuCategory,
    "menu category",
  ).filter((category) => category.active);
  if (!categories.length) {
    return [];
  }

  const itemUrl = new URL(`${config.url}/rest/v1/menu_items`);
  itemUrl.searchParams.set(
    "select",
    "id,name,description,price_cents,category_id,item_order,active,created_at,updated_at",
  );
  itemUrl.searchParams.set("active", "eq.true");
  itemUrl.searchParams.set(
    "category_id",
    `in.(${categories.map((category) => category.id).join(",")})`,
  );
  itemUrl.searchParams.set("order", "category_id.asc,item_order.asc,id.asc");
  itemUrl.searchParams.set("limit", "500");
  let itemResponse: Response;
  try {
    itemResponse = await fetchImpl(itemUrl, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new MenuServiceError("The menu database request failed.");
  }
  if (!itemResponse.ok) {
    throw new MenuServiceError("The menu database request failed.");
  }
  const items = requireRows(
    await readJson(itemResponse, "menu item"),
    isMenuItem,
    "menu item",
  );
  return sortedGroups(categories, items);
}

const MENU_CATEGORY_SELECT =
  "id,name,category_order,active,created_at,updated_at";
const MENU_ITEM_SELECT =
  "id,name,description,price_cents,category_id,item_order,active,created_at,updated_at";

async function fetchAdminRows<T>(
  context: AdminApiContext,
  path: string,
  validate: (row: unknown) => row is T,
  label: string,
  dependencies: AdminDependencies,
): Promise<T[]> {
  const response = await adminSupabaseFetch(
    context,
    path,
    { method: "GET" },
    dependencies,
  );
  if (!response?.ok) {
    throw new MenuServiceError(`${label} request failed.`);
  }
  return requireRows(await readJson(response, label), validate, label);
}

export async function loadAdminMenu(
  context: AdminApiContext,
  dependencies: AdminDependencies,
): Promise<{ categories: MenuCategory[]; items: MenuItem[] }> {
  const categoryValidator = isMenuCategory;
  const categoriesRequest = fetchAdminRows(
    context,
    `/rest/v1/menu_categories?select=${MENU_CATEGORY_SELECT}&order=category_order.asc,id.asc&limit=500`,
    categoryValidator,
    "Menu category",
    dependencies,
  );
  const itemsRequest = fetchAdminRows(
    context,
    `/rest/v1/menu_items?select=${MENU_ITEM_SELECT}&order=category_id.asc,item_order.asc,id.asc&limit=500`,
    isMenuItem,
    "Menu item",
    dependencies,
  );
  const [categories, items] = await Promise.all([categoriesRequest, itemsRequest]);
  return { categories, items };
}

export async function saveAdminRow<T>(
  context: AdminApiContext,
  table: "menu_categories" | "menu_items",
  fields: MenuCategoryFields | MenuItemFields,
  method: "POST" | "PATCH",
  id: string | null,
  validate: (row: unknown) => row is T,
  dependencies: AdminDependencies,
): Promise<T> {
  const select = table === "menu_categories" ? MENU_CATEGORY_SELECT : MENU_ITEM_SELECT;
  const path = `/rest/v1/${table}?${id ? `id=eq.${encodeURIComponent(id)}&` : ""}select=${select}`;
  const response = await adminSupabaseFetch(
    context,
    path,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(fields),
    },
    dependencies,
  );
  if (!response?.ok) {
    throw new MenuServiceError(`${table === "menu_categories" ? "Menu category" : "Menu item"} save failed.`);
  }
  const rows = requireRows(await readJson(response, "menu save"), validate, "menu save");
  if (rows.length !== 1) {
    throw new MenuServiceError("The menu item was not found.");
  }
  return rows[0];
}

export async function removeAdminMenuItem(
  context: AdminApiContext,
  id: string,
  dependencies: AdminDependencies,
): Promise<boolean> {
  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}&select=id`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
    dependencies,
  );
  if (!response?.ok) {
    throw new MenuServiceError("Menu item deletion failed.");
  }
  const rows = await readJson(response, "menu item deletion");
  if (!Array.isArray(rows)) {
    throw new MenuServiceError("The menu item deletion response was invalid.");
  }
  return rows.length === 1 && isRecord(rows[0]) && rows[0].id === id;
}

export async function removeAdminMenuCategory(
  context: AdminApiContext,
  id: string,
  dependencies: AdminDependencies,
): Promise<"deleted" | "in_use" | "not_found"> {
  const query = new URLSearchParams({
    select: "id",
    category_id: `eq.${id}`,
    limit: "1",
  });
  const items = await fetchAdminRows(
    context,
    `/rest/v1/menu_items?${query}`,
    (value): value is { id: string } =>
      isRecord(value) && typeof value.id === "string",
    "Menu category assignment",
    dependencies,
  );
  if (items.length > 0) {
    return "in_use";
  }

  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/menu_categories?id=eq.${encodeURIComponent(id)}&select=id`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
    dependencies,
  );
  if (response?.status === 409) {
    return "in_use";
  }
  if (!response?.ok) {
    throw new MenuServiceError("Menu category deletion failed.");
  }
  const rows = await readJson(response, "menu category deletion");
  if (!Array.isArray(rows)) {
    throw new MenuServiceError("The menu category deletion response was invalid.");
  }
  if (!rows.length) {
    return "not_found";
  }
  return rows.length === 1 && isRecord(rows[0]) && rows[0].id === id
    ? "deleted"
    : "not_found";
}

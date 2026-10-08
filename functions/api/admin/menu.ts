import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
  readJsonBody,
} from "../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../_shared/admin.ts";
import type { Env } from "../../_shared/config.ts";
import { jsonResponse } from "../../_shared/http.ts";

export type MenuRow = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  category_order: number;
  item_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MenuFields = Omit<MenuRow, "id" | "created_at" | "updated_at">;

export function isMenuRow(value: unknown): value is MenuRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    item.name.length <= 120 &&
    typeof item.description === "string" &&
    item.description.length <= 1000 &&
    Number.isSafeInteger(item.price_cents) &&
    typeof item.price_cents === "number" &&
    item.price_cents >= 0 &&
    typeof item.category === "string" &&
    item.category.trim().length > 0 &&
    item.category.length <= 80 &&
    Number.isSafeInteger(item.category_order) &&
    Number.isSafeInteger(item.item_order) &&
    typeof item.active === "boolean" &&
    typeof item.created_at === "string" &&
    typeof item.updated_at === "string";
}

export function menuFields(value: unknown): MenuFields | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.name !== "string" ||
    fields.name.trim().length < 1 ||
    fields.name.trim().length > 120 ||
    typeof fields.description !== "string" ||
    fields.description.length > 1000 ||
    typeof fields.priceCents !== "number" ||
    !Number.isSafeInteger(fields.priceCents) ||
    fields.priceCents < 0 ||
    fields.priceCents > 100_000_000 ||
    typeof fields.category !== "string" ||
    fields.category.trim().length < 1 ||
    fields.category.trim().length > 80 ||
    !Number.isSafeInteger(fields.categoryOrder) ||
    (fields.categoryOrder as number) < 0 ||
    (fields.categoryOrder as number) > 1000 ||
    !Number.isSafeInteger(fields.itemOrder) ||
    (fields.itemOrder as number) < 0 ||
    (fields.itemOrder as number) > 10000 ||
    typeof fields.active !== "boolean"
  ) {
    return null;
  }
  return {
    name: fields.name.trim(),
    description: fields.description.trim(),
    price_cents: fields.priceCents,
    category: fields.category.trim(),
    category_order: fields.categoryOrder as number,
    item_order: fields.itemOrder as number,
    active: fields.active,
  };
}

function mapMenuItem(item: MenuRow) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    priceCents: item.price_cents,
    category: item.category,
    categoryOrder: item.category_order,
    itemOrder: item.item_order,
    active: item.active,
    updatedAt: item.updated_at,
  };
}

export async function handleAdminMenuRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (!["GET", "POST"].includes(request.method)) {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (request.method === "POST" && !isSameOriginMutation(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }
  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  const select = "id,name,description,price_cents,category,category_order,item_order,active,created_at,updated_at";

  if (request.method === "GET") {
    const response = await adminSupabaseFetch(
      context,
      `/rest/v1/menu_items?select=${select}&order=category_order.asc,item_order.asc,id.asc&limit=500`,
      { method: "GET" },
      dependencies,
    );
    if (!response?.ok) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Menu catalog request failed."),
        context.cookie,
      );
    }
    let rows: unknown;
    try {
      rows = await response.json();
    } catch {
      rows = null;
    }
    if (!Array.isArray(rows) || rows.length > 500 || !rows.every(isMenuRow)) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Menu catalog response was invalid."),
        context.cookie,
      );
    }
    return withCookie(jsonResponse({ items: rows.map(mapMenuItem) }), context.cookie);
  }

  const fields = menuFields(await readJsonBody(request));
  if (!fields) {
    return withCookie(jsonResponse({ error: "Menu item details are invalid." }, 400), context.cookie);
  }
  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/menu_items?select=${select}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(fields),
    },
    dependencies,
  );
  if (!response?.ok) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Menu item creation failed."),
      context.cookie,
    );
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows) || rows.length !== 1 || !isMenuRow(rows[0])) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Menu item creation response was invalid."),
      context.cookie,
    );
  }
  return withCookie(jsonResponse({ item: mapMenuItem(rows[0]) }, 201), context.cookie);
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleAdminMenuRequest(request, env);

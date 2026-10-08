import {
  ConfigurationError,
  readSupabaseConfig,
  type Env,
} from "../_shared/config.ts";
import {
  jsonResponse,
  methodNotAllowed,
  serviceUnavailable,
  upstreamFailure,
  type PagesHandler,
} from "../_shared/http.ts";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  category_order: number;
  item_order: number;
  active: boolean;
};

type Dependencies = {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "error">;
};

function isMenuItem(value: unknown): value is MenuItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(item.id) &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    item.name.length <= 120 &&
    typeof item.description === "string" &&
    item.description.length <= 1000 &&
    typeof item.price_cents === "number" &&
    Number.isSafeInteger(item.price_cents) &&
    item.price_cents >= 0 &&
    typeof item.category === "string" &&
    item.category.trim().length > 0 &&
    item.category.length <= 80 &&
    Number.isSafeInteger(item.category_order) &&
    Number.isSafeInteger(item.item_order) &&
    item.active === true;
}

export async function handleMenuRequest(
  request: Request,
  env: Env,
  dependencies: Dependencies = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }
  const logger = dependencies.logger ?? console;
  let config;
  try {
    config = readSupabaseConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    logger.error("[api] Supabase configuration is missing or invalid.");
    return serviceUnavailable();
  }

  const url = new URL(`${config.url}/rest/v1/menu_items`);
  url.searchParams.set(
    "select",
    "id,name,description,price_cents,category,category_order,item_order,active",
  );
  url.searchParams.set("active", "eq.true");
  url.searchParams.set("order", "category_order.asc,item_order.asc,id.asc");
  url.searchParams.set("limit", "500");

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(url, {
      headers: { apikey: config.publishableKey, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    logger.error("[api] Supabase request failed.");
    return upstreamFailure();
  }
  if (!response.ok) {
    logger.error(`[api] Supabase returned HTTP ${response.status}.`);
    return upstreamFailure();
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    logger.error("[api] Supabase returned an invalid menu response.");
    return upstreamFailure();
  }
  if (!Array.isArray(rows) || rows.length > 500 || !rows.every(isMenuItem)) {
    logger.error("[api] Supabase returned an invalid menu result.");
    return upstreamFailure();
  }

  const categories = new Map<string, {
    category: string;
    order: number;
    items: Array<{
      id: string;
      name: string;
      priceCents: number;
      description: string;
      order: number;
    }>;
  }>();
  for (const row of rows) {
    let category = categories.get(row.category);
    if (!category) {
      category = { category: row.category, order: row.category_order, items: [] };
      categories.set(row.category, category);
    } else if (row.category_order < category.order) {
      category.order = row.category_order;
    }
    category.items.push({
      id: row.id,
      name: row.name,
      priceCents: row.price_cents,
      description: row.description,
      order: row.item_order,
    });
  }
  const orderedCategories = [...categories.values()];
  orderedCategories.sort((left, right) => left.order - right.order);
  return jsonResponse({
    categories: orderedCategories.map(({ category, items }) => ({
      category,
      items: items
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map(({ id, name, priceCents, description }) => ({
          id,
          name,
          priceCents,
          description,
        })),
    })),
  });
}

export const onRequest: PagesHandler<Env> = ({ request, env }) =>
  handleMenuRequest(request, env);

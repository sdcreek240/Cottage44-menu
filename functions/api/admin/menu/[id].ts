import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
  readJsonBody,
} from "../../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../../_shared/admin.ts";
import type { Env } from "../../../_shared/config.ts";
import { jsonResponse } from "../../../_shared/http.ts";
import { isMenuRow, menuFields } from "../menu.ts";

export async function handleAdminMenuItemRequest(
  request: Request,
  env: Env,
  id: string,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (!["PATCH", "DELETE"].includes(request.method)) {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return jsonResponse({ error: "Menu item not found." }, 404);
  }
  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  const filter = encodeURIComponent(id);
  const select = "id,name,description,price_cents,category,category_order,item_order,active,created_at,updated_at";
  if (request.method === "DELETE") {
    const response = await adminSupabaseFetch(
      context,
      `/rest/v1/menu_items?id=eq.${filter}&select=id`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
      dependencies,
    );
    if (!response?.ok) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Menu item deletion failed."),
        context.cookie,
      );
    }
    let rows: unknown;
    try {
      rows = await response.json();
    } catch {
      rows = null;
    }
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== id) {
      return withCookie(jsonResponse({ error: "Menu item not found." }, 404), context.cookie);
    }
    return withCookie(jsonResponse({ deleted: true }), context.cookie);
  }

  const fields = menuFields(await readJsonBody(request));
  if (!fields) {
    return withCookie(jsonResponse({ error: "Menu item details are invalid." }, 400), context.cookie);
  }
  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/menu_items?id=eq.${filter}&select=${select}`,
    {
      method: "PATCH",
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
      adminFailure(dependencies.logger ?? console, "Menu item update failed."),
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
    return withCookie(jsonResponse({ error: "Menu item not found." }, 404), context.cookie);
  }
  const item = rows[0];
  return withCookie(jsonResponse({
    item: {
      id: item.id,
      name: item.name,
      description: item.description,
      priceCents: item.price_cents,
      category: item.category,
      categoryOrder: item.category_order,
      itemOrder: item.item_order,
      active: item.active,
      updatedAt: item.updated_at,
    },
  }), context.cookie);
}

export const onRequest = ({ request, env, params }: {
  request: Request;
  env: Env;
  params: { id: string };
}) => handleAdminMenuItemRequest(request, env, params.id);

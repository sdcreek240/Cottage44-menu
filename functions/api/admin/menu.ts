import {
  adminFailure,
  getAdminApiContext,
  readJsonBody,
} from "../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../_shared/admin.ts";
import type { Env } from "../../_shared/config.ts";
import {
  isMenuItem,
  loadAdminMenu,
  MenuServiceError,
  menuItemFields,
  saveAdminRow,
} from "../../_shared/menu-service.ts";
import { jsonResponse } from "../../_shared/http.ts";

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
  try {
    if (request.method === "GET") {
      const { categories, items } = await loadAdminMenu(context, dependencies);
      return withCookie(jsonResponse({
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          categoryOrder: category.category_order,
          active: category.active,
        })),
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          priceCents: item.price_cents,
          categoryId: item.category_id,
          itemOrder: item.item_order,
          active: item.active,
        })),
      }), context.cookie);
    }

    const fields = menuItemFields(await readJsonBody(request));
    if (!fields) {
      return withCookie(
        jsonResponse({ error: "Menu item details are invalid." }, 400),
        context.cookie,
      );
    }
    const item = await saveAdminRow(
      context,
      "menu_items",
      fields,
      "POST",
      null,
      isMenuItem,
      dependencies,
    );
    return withCookie(jsonResponse({
      item: {
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.price_cents,
        categoryId: item.category_id,
        itemOrder: item.item_order,
        active: item.active,
      },
    }, 201), context.cookie);
  } catch (error) {
    if (!(error instanceof MenuServiceError)) {
      throw error;
    }
    return withCookie(
      adminFailure(dependencies.logger ?? console, error.message),
      context.cookie,
    );
  }
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleAdminMenuRequest(request, env);

import {
  getAdminApiContext,
  readJsonBody,
} from "../../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../../_shared/admin.ts";
import type { Env } from "../../../_shared/config.ts";
import {
  isMenuItem,
  MenuServiceError,
  menuItemFields,
  removeAdminMenuItem,
  saveAdminRow,
} from "../../../_shared/menu-service.ts";
import { jsonResponse } from "../../../_shared/http.ts";

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
  try {
    if (request.method === "DELETE") {
      const deleted = await removeAdminMenuItem(context, id, dependencies);
      return withCookie(
        deleted
          ? jsonResponse({ deleted: true })
          : jsonResponse({ error: "Menu item not found." }, 404),
        context.cookie,
      );
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
      "PATCH",
      id,
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
    }), context.cookie);
  } catch (error) {
    if (!(error instanceof MenuServiceError)) {
      throw error;
    }
    return withCookie(
      jsonResponse({ error: "The menu request could not be completed." }, 502),
      context.cookie,
    );
  }
}

export const onRequest = ({ request, env, params }: {
  request: Request;
  env: Env;
  params: { id: string };
}) => handleAdminMenuItemRequest(request, env, params.id);

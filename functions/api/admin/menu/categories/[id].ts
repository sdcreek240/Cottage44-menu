import {
  adminFailure,
  getAdminApiContext,
  readJsonBody,
} from "../../../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../../../_shared/admin.ts";
import type { Env } from "../../../../_shared/config.ts";
import {
  isMenuCategory,
  MenuServiceError,
  menuCategoryFields,
  removeAdminMenuCategory,
  saveAdminRow,
} from "../../../../_shared/menu-service.ts";
import { jsonResponse } from "../../../../_shared/http.ts";

export async function handleMenuCategoryRequest(
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
    return jsonResponse({ error: "Menu category not found." }, 404);
  }
  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  try {
    if (request.method === "DELETE") {
      const outcome = await removeAdminMenuCategory(context, id, dependencies);
      if (outcome === "in_use") {
        return withCookie(
          jsonResponse({
            error: "This category still contains menu items. Move or remove those items before deleting the category.",
          }, 409),
          context.cookie,
        );
      }
      return withCookie(
        outcome === "deleted"
          ? jsonResponse({ deleted: true })
          : jsonResponse({ error: "Menu category not found." }, 404),
        context.cookie,
      );
    }

    const fields = menuCategoryFields(await readJsonBody(request));
    if (!fields) {
      return withCookie(
        jsonResponse({ error: "Menu category details are invalid." }, 400),
        context.cookie,
      );
    }
    const category = await saveAdminRow(
      context,
      "menu_categories",
      fields,
      "PATCH",
      id,
      isMenuCategory,
      dependencies,
    );
    return withCookie(jsonResponse({
      category: {
        id: category.id,
        name: category.name,
        categoryOrder: category.category_order,
        active: category.active,
      },
    }), context.cookie);
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

export const onRequest = ({ request, env, params }: {
  request: Request;
  env: Env;
  params: { id: string };
}) => handleMenuCategoryRequest(request, env, params.id);

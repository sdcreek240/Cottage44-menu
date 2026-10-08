import {
  adminFailure,
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
  isMenuCategory,
  MenuServiceError,
  menuCategoryFields,
  saveAdminRow,
} from "../../../_shared/menu-service.ts";
import { jsonResponse } from "../../../_shared/http.ts";

export async function handleMenuCategoriesRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (!["POST"].includes(request.method)) {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!isSameOriginMutation(request)) {
    return jsonResponse({ error: "Forbidden." }, 403);
  }
  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  const fields = menuCategoryFields(await readJsonBody(request));
  if (!fields) {
    return withCookie(
      jsonResponse({ error: "Menu category details are invalid." }, 400),
      context.cookie,
    );
  }
  try {
    const category = await saveAdminRow(
      context,
      "menu_categories",
      fields,
      "POST",
      null,
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
  handleMenuCategoriesRequest(request, env);

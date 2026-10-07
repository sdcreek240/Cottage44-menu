import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
  readJsonBody,
  validImageUrl,
} from "../../../_shared/admin-api.ts";
import {
  isSameOriginMutation,
  withCookie,
  type AdminDependencies,
} from "../../../_shared/admin.ts";
import type { Env } from "../../../_shared/config.ts";
import { jsonResponse } from "../../../_shared/http.ts";
import { isPlate, plateFields } from "../plates.ts";

type RouteContext = {
  request: Request;
  env: Env;
  params: { id: string };
};

export async function handlePlateRequest(
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return jsonResponse({ error: "Plate not found." }, 404);
  }

  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  const filter = encodeURIComponent(id);

  if (request.method === "DELETE") {
    const response = await adminSupabaseFetch(
      context,
      `/rest/v1/plates?id=eq.${filter}&select=id`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
      dependencies,
    );
    if (!response?.ok) {
      if (response?.status === 409) {
        return withCookie(
          jsonResponse({
            error: "This plate is assigned for today or a future date. Change that plan before deleting it.",
          }, 409),
          context.cookie,
        );
      }
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Plate deletion failed."),
        context.cookie,
      );
    }
    let deletedRows: unknown;
    try {
      deletedRows = await response.json();
    } catch {
      deletedRows = null;
    }
    if (
      !Array.isArray(deletedRows) ||
      deletedRows.length !== 1 ||
      typeof deletedRows[0] !== "object" ||
      deletedRows[0] === null ||
      !("id" in deletedRows[0]) ||
      deletedRows[0].id !== id
    ) {
      return withCookie(
        jsonResponse({ error: "Plate not found." }, 404),
        context.cookie,
      );
    }
    return withCookie(jsonResponse({ deleted: true }), context.cookie);
  }

  const body = await readJsonBody(request);
  const fields = plateFields(body, (imageUrl) => validImageUrl(imageUrl, context.config));
  if (!fields) {
    return withCookie(
      jsonResponse({ error: "Plate details are invalid." }, 400),
      context.cookie,
    );
  }

  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/plates?id=eq.${filter}&select=id,name,description,price_cents,image_url,created_at,updated_at`,
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
      adminFailure(dependencies.logger ?? console, "Plate update failed."),
      context.cookie,
    );
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !isPlate(rows[0], context.config)
  ) {
    return withCookie(
      jsonResponse({ error: "Plate not found." }, 404),
      context.cookie,
    );
  }
  const plate = rows[0];
  return withCookie(
    jsonResponse({
      plate: {
        id: plate.id,
        name: plate.name,
        description: plate.description,
        priceCents: plate.price_cents,
        imageUrl: plate.image_url,
        updatedAt: plate.updated_at,
      },
    }),
    context.cookie,
  );
}

export const onRequest = ({ request, env, params }: RouteContext) =>
  handlePlateRequest(request, env, params.id);

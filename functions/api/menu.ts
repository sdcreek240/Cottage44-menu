import {
  loadPublicMenu,
  MenuServiceError,
} from "../_shared/menu-service.ts";
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

type Dependencies = {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "error">;
};

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
  try {
    const categories = await loadPublicMenu(config, dependencies);
    return jsonResponse({
      categories: categories.map(({ category, items }) => ({ category, items })),
    });
  } catch (error) {
    if (!(error instanceof MenuServiceError)) {
      throw error;
    }
    logger.error(`[api] ${error.message}`);
    return upstreamFailure();
  }
}

export const onRequest: PagesHandler<Env> = ({ request, env }) =>
  handleMenuRequest(request, env);

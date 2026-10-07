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
import { getBusinessDate } from "../../../_shared/business-date.ts";
import type { Env, SupabaseConfig } from "../../../_shared/config.ts";
import { jsonResponse } from "../../../_shared/http.ts";

type DailyPlate = {
  service_date: string;
  plate: {
    id: string;
    name: string;
    description: string;
    price_cents: number;
    image_url: string | null;
  };
};

function isServiceDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPlannableDate(value: string, today: string): boolean {
  const requested = Date.parse(`${value}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(requested) &&
    requested >= current &&
    requested <= current + 365 * 24 * 60 * 60 * 1000;
}

function validDailyPlate(value: unknown, config: SupabaseConfig): value is DailyPlate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const daily = value as Record<string, unknown>;
  if (
    typeof daily.service_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(daily.service_date) ||
    typeof daily.plate !== "object" ||
    daily.plate === null
  ) {
    return false;
  }
  const plate = daily.plate as Record<string, unknown>;
  return (
    typeof plate.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(plate.id) &&
    typeof plate.name === "string" &&
    plate.name.trim().length > 0 &&
    plate.name.length <= 120 &&
    typeof plate.description === "string" &&
    plate.description.length <= 1000 &&
    typeof plate.price_cents === "number" &&
    Number.isSafeInteger(plate.price_cents) &&
    plate.price_cents >= 0 &&
    validImageUrl(plate.image_url, config)
  );
}

function mapDailyPlate(value: DailyPlate) {
  return {
    serviceDate: value.service_date,
    plate: {
      id: value.plate.id,
      name: value.plate.name,
      description: value.plate.description,
      priceCents: value.plate.price_cents,
      imageUrl: value.plate.image_url,
    },
  };
}

export async function handleTodayAdminRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
  now?: Date,
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

  if (request.method === "GET") {
    const todayDate = getBusinessDate(now);
    const latestDate = new Date(
      Date.parse(`${todayDate}T00:00:00.000Z`) + 365 * 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);
    const query = new URLSearchParams({
      select: "service_date,plate:plates(id,name,description,price_cents,image_url)",
      order: "service_date.desc",
      limit: "366",
      and: `(service_date.gte.${todayDate},service_date.lte.${latestDate})`,
    });
    const response = await adminSupabaseFetch(
      context,
      `/rest/v1/daily_plates?${query.toString()}`,
      { method: "GET" },
      dependencies,
    );
    if (!response?.ok) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Upcoming plate schedule request failed."),
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
      rows.length > 366 ||
      !rows.every((row) => validDailyPlate(row, context.config))
    ) {
      return withCookie(
        adminFailure(dependencies.logger ?? console, "Upcoming plate schedule response was invalid."),
        context.cookie,
      );
    }
    const upcoming = rows.map(mapDailyPlate);
    return withCookie(
      jsonResponse({
        serviceDate: todayDate,
        today: upcoming.find((item) => item.serviceDate === todayDate)?.plate ?? null,
        upcoming,
      }),
      context.cookie,
    );
  }

  const body = await readJsonBody(request, 4096);
  const todayDate = getBusinessDate(now);
  if (typeof body !== "object" || body === null || !("plateId" in body)) {
    return withCookie(
      jsonResponse({ error: "Choose a saved plate or mark the day as not planned." }, 400),
      context.cookie,
    );
  }
  const plateId = body.plateId;
  if (
    plateId !== null &&
    (typeof plateId !== "string" || !/^[0-9a-f-]{36}$/i.test(plateId))
  ) {
    return withCookie(
      jsonResponse({ error: "Choose a saved plate or mark the day as not planned." }, 400),
      context.cookie,
    );
  }
  const requestedServiceDate =
    "serviceDate" in body ? body.serviceDate : undefined;
  const serviceDate = isServiceDate(requestedServiceDate)
    ? requestedServiceDate
    : todayDate;
  if (!isPlannableDate(serviceDate, todayDate)) {
    return withCookie(
      jsonResponse({ error: "Choose a date from today through the next year." }, 400),
      context.cookie,
    );
  }
  if (plateId === null) {
    const query = new URLSearchParams({
      service_date: `eq.${serviceDate}`,
      select: "service_date",
    });
    const response = await adminSupabaseFetch(
      context,
      `/rest/v1/daily_plates?${query.toString()}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      },
      dependencies,
    );
    if (!response?.ok) {
      dependencies.logger?.error?.(`[admin] Clearing the plate for ${serviceDate} failed.`);
      const futurePlanningUnavailable =
        serviceDate !== todayDate && [401, 403].includes(response?.status ?? 0);
      return withCookie(
        jsonResponse(
          {
            error: futurePlanningUnavailable
              ? "Future planning is not enabled yet. Please ask the site administrator to apply the latest database migration, then try again."
              : `The plate for ${serviceDate} could not be cleared. Please try again.`,
          },
          futurePlanningUnavailable ? 503 : 502,
        ),
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
      rows.length > 1 ||
      !rows.every((row) =>
        typeof row === "object" &&
        row !== null &&
        "service_date" in row &&
        row.service_date === serviceDate
      )
    ) {
      return withCookie(
        jsonResponse(
          { error: `The plate for ${serviceDate} could not be cleared. Please try again.` },
          502,
        ),
        context.cookie,
      );
    }
    return withCookie(
      jsonResponse({ cleared: true, serviceDate }),
      context.cookie,
    );
  }

  const response = await adminSupabaseFetch(
    context,
    "/rest/v1/daily_plates?on_conflict=service_date&select=service_date,plate:plates(id,name,description,price_cents,image_url)",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        service_date: serviceDate,
        plate_id: plateId,
      }),
    },
    dependencies,
  );
  if (!response?.ok) {
    dependencies.logger?.error?.(`[admin] Saving the plate for ${serviceDate} failed.`);
    const futurePlanningUnavailable =
      serviceDate !== todayDate && [401, 403].includes(response?.status ?? 0);
    return withCookie(
      jsonResponse(
        {
          error: futurePlanningUnavailable
            ? "Future planning is not enabled yet. Please ask the site administrator to apply the latest database migration, then try again."
            : `The plate for ${serviceDate} could not be saved. Please try again.`,
        },
        futurePlanningUnavailable ? 503 : 502,
      ),
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
    !validDailyPlate(rows[0], context.config) ||
    rows[0].service_date !== serviceDate ||
    rows[0].plate.id !== plateId
  ) {
    return withCookie(
      jsonResponse(
        { error: `The plate for ${serviceDate} could not be saved. Please try again.` },
        502,
      ),
      context.cookie,
    );
  }
  return withCookie(
    jsonResponse({ today: mapDailyPlate(rows[0]) }),
    context.cookie,
  );
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleTodayAdminRequest(request, env);

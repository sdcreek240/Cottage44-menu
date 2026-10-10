import { getBusinessDate } from "../../_shared/business-date.ts";
import {
  ConfigurationError,
  readSupabaseConfig,
  type Env,
} from "../../_shared/config.ts";
import {
  jsonResponse,
  methodNotAllowed,
  serviceUnavailable,
  upstreamFailure,
  type PagesHandler,
} from "../../_shared/http.ts";

type PlateRecord = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
};

type DailyPlateRecord = {
  service_date: string;
  plate: PlateRecord;
};

type Dependencies = {
  fetchImpl?: typeof fetch;
  now?: Date;
  logger?: Pick<Console, "error">;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
}

function isWorkday(isoDate: string): boolean {
  const dow = dayOfWeek(isoDate);
  return dow >= 1 && dow <= 5;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The workdays we want in the "upcoming" rail, in order.
 *
 *   Fri / Sat / Sun → next week's Mon–Fri (bridge the weekend).
 *   Mon–Thu         → the rest of the current week, up to Friday.
 *
 * Always non-empty; always in ascending order; never includes today.
 */
function upcomingWorkdaysFrom(todayIso: string): string[] {
  const dow = dayOfWeek(todayIso);
  const dates: string[] = [];

  if (dow === 5 || dow === 6 || dow === 0) {
    // Bridge to next week: keep walking forward until we have five workdays.
    let cursor = todayIso;
    while (dates.length < 5) {
      cursor = addDays(cursor, 1);
      if (isWorkday(cursor)) dates.push(cursor);
    }
    return dates;
  }

  // Mon–Thu: walk forward, stop at the weekend boundary, cap at five.
  let cursor = todayIso;
  while (dates.length < 5) {
    cursor = addDays(cursor, 1);
    if (!isWorkday(cursor)) break;
    dates.push(cursor);
  }
  return dates;
}

function isSafeImageUrl(value: unknown, supabaseOrigin: string): value is string | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.origin === supabaseOrigin &&
      url.pathname.startsWith("/storage/v1/object/public/cottage44-plates/") &&
      /^\/storage\/v1\/object\/public\/cottage44-plates\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(
        url.pathname,
      ) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isDailyPlateRecord(
  value: unknown,
  serviceDate: string,
  supabaseOrigin: string,
): value is DailyPlateRecord {
  if (!isRecord(value) || value.service_date !== serviceDate || !isRecord(value.plate)) {
    return false;
  }

  const plate = value.plate;
  return (
    typeof plate.id === "string" &&
    UUID_PATTERN.test(plate.id) &&
    typeof plate.name === "string" &&
    plate.name.trim().length > 0 &&
    plate.name.length <= 120 &&
    typeof plate.description === "string" &&
    plate.description.length <= 1000 &&
    typeof plate.price_cents === "number" &&
    Number.isSafeInteger(plate.price_cents) &&
    plate.price_cents >= 0 &&
    isSafeImageUrl(plate.image_url, supabaseOrigin)
  );
}

export async function handleTodayRequest(
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

  const serviceDate = getBusinessDate(dependencies.now);
  const upcomingDates = upcomingWorkdaysFrom(serviceDate);

  // Today is only meaningful on a workday. On weekends we still query
  // `upcomingDates` so the client can render the "next week" rail.
  const today = isWorkday(serviceDate) ? serviceDate : null;

  // Every date the response is allowed to contain, in ascending order.
  const queryDates = today ? [today, ...upcomingDates] : upcomingDates;
  const firstDate = queryDates[0];
  const lastDate = queryDates[queryDates.length - 1];

  const queryUrl = new URL(`${config.url}/rest/v1/daily_plates`);
  queryUrl.searchParams.set(
    "select",
    "service_date,plate:plates(id,name,description,price_cents,image_url)",
  );
  queryUrl.searchParams.append("service_date", `gte.${firstDate}`);
  queryUrl.searchParams.append("service_date", `lte.${lastDate}`);
  queryUrl.searchParams.set("order", "service_date.asc");
  queryUrl.searchParams.set("limit", String(queryDates.length));

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(queryUrl, {
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
    logger.error("[api] Supabase returned an invalid JSON response.");
    return upstreamFailure();
  }

  if (!Array.isArray(rows) || rows.length > queryDates.length) {
    logger.error("[api] Supabase returned an invalid daily plate result.");
    return upstreamFailure();
  }

  const allowedDates = new Set(queryDates);
  const rowByDate = new Map<string, DailyPlateRecord>();
  for (const row of rows) {
    if (
      !isRecord(row) ||
      typeof row.service_date !== "string" ||
      !allowedDates.has(row.service_date) ||
      !isDailyPlateRecord(row, row.service_date, config.url)
    ) {
      logger.error("[api] Supabase returned a daily plate with an invalid schema.");
      return upstreamFailure();
    }
    if (rowByDate.has(row.service_date)) {
      logger.error("[api] Supabase returned duplicate service dates.");
      return upstreamFailure();
    }
    rowByDate.set(row.service_date, row);
  }

  const mapPlate = (row: DailyPlateRecord | undefined) =>
    row
      ? {
          id: row.plate.id,
          serviceDate: row.service_date,
          name: row.plate.name.trim(),
          description: row.plate.description,
          priceCents: row.plate.price_cents,
          imageUrl: row.plate.image_url,
        }
      : null;

  return jsonResponse({
    plate: today ? mapPlate(rowByDate.get(today)) : null,
    upcoming: upcomingDates.map((serviceDate) => ({
      serviceDate,
      plate: mapPlate(rowByDate.get(serviceDate)),
    })),
  });
}

export const onRequest: PagesHandler<Env> = ({ request, env }) =>
  handleTodayRequest(request, env);
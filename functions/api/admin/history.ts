import {
  adminFailure,
  adminSupabaseFetch,
  getAdminApiContext,
  validImageUrl,
} from "../../_shared/admin-api.ts";
import { withCookie, type AdminDependencies } from "../../_shared/admin.ts";
import type { Env, SupabaseConfig } from "../../_shared/config.ts";
import { jsonResponse } from "../../_shared/http.ts";

type PlateSnapshot = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  image_url: string | null;
};

type HistoryEvent = {
  id: number;
  service_date: string;
  event_type: "assigned" | "changed" | "cleared" | "plate_deleted" | "backfilled";
  previous_plate: PlateSnapshot | null;
  current_plate: PlateSnapshot | null;
  occurred_at: string;
};

function isPlateSnapshot(value: unknown, config: SupabaseConfig): value is PlateSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const plate = value as Record<string, unknown>;
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

function isHistoryEvent(value: unknown, config: SupabaseConfig): value is HistoryEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  const eventType = event.event_type;
  const snapshot = (item: unknown) =>
    item === null || isPlateSnapshot(item, config);
  if (
    !["assigned", "changed", "cleared", "plate_deleted", "backfilled"].includes(
      String(eventType),
    ) ||
    !snapshot(event.previous_plate) ||
    !snapshot(event.current_plate)
  ) {
    return false;
  }
  const validTransition =
    (["assigned", "backfilled"].includes(String(eventType)) &&
      event.previous_plate === null &&
      event.current_plate !== null) ||
    (eventType === "changed" &&
      event.previous_plate !== null &&
      event.current_plate !== null) ||
    (["cleared", "plate_deleted"].includes(String(eventType)) &&
      event.previous_plate !== null &&
      event.current_plate === null);
  return (
    typeof event.id === "number" &&
    Number.isSafeInteger(event.id) &&
    event.id > 0 &&
    typeof event.service_date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(event.service_date) &&
    validTransition &&
    typeof event.occurred_at === "string" &&
    Number.isFinite(Date.parse(event.occurred_at))
  );
}

function mapPlateSnapshot(plate: PlateSnapshot | null) {
  if (plate === null) {
    return null;
  }
  return {
    id: plate.id,
    name: plate.name,
    description: plate.description,
    priceCents: plate.price_cents,
    imageUrl: plate.image_url,
  };
}

export async function handleHistoryRequest(
  request: Request,
  env: Env,
  dependencies: AdminDependencies = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  const url = new URL(request.url);
  const beforeParam = url.searchParams.get("before");
  const before = beforeParam === null ? null : Number(beforeParam);
  if (
    beforeParam !== null &&
    (!/^[1-9]\d*$/.test(beforeParam) || !Number.isSafeInteger(before))
  ) {
    return jsonResponse({ error: "History page is invalid." }, 400);
  }

  const result = await getAdminApiContext(request, env, dependencies);
  if ("response" in result) {
    return withCookie(result.response, result.cookie);
  }
  const { context } = result;
  const query = new URLSearchParams({
    select: "id,service_date,event_type,previous_plate,current_plate,occurred_at",
    order: "id.desc",
    limit: "101",
  });
  if (before !== null) {
    query.set("id", `lt.${before}`);
  }
  const response = await adminSupabaseFetch(
    context,
    `/rest/v1/plate_assignment_history?${query.toString()}`,
    { method: "GET" },
    dependencies,
  );
  if (!response?.ok) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Plate assignment history request failed."),
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
    rows.length > 101 ||
    !rows.every((row) => isHistoryEvent(row, context.config))
  ) {
    return withCookie(
      adminFailure(dependencies.logger ?? console, "Plate assignment history response was invalid."),
      context.cookie,
    );
  }
  const hasMore = rows.length > 100;
  const events = rows.slice(0, 100).map((event) => ({
    id: event.id,
    serviceDate: event.service_date,
    eventType: event.event_type,
    previousPlate: mapPlateSnapshot(event.previous_plate),
    currentPlate: mapPlateSnapshot(event.current_plate),
    occurredAt: event.occurred_at,
  }));
  return withCookie(
    jsonResponse({
      events,
      hasMore,
      nextBefore: hasMore && events.length ? events[events.length - 1].id : null,
    }),
    context.cookie,
  );
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  handleHistoryRequest(request, env);

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = await readFile(
  path.join(
    root,
    "supabase/migrations/20261007150000_remove_not_planned_schedule_links.sql",
  ),
  "utf8",
);
const historyMigration = await readFile(
  path.join(
    root,
    "supabase/migrations/20261007160000_add_plate_assignment_history.sql",
  ),
  "utf8",
);
const menuMigration = await readFile(
  path.join(
    root,
    "supabase/migrations/20261008100000_normalize_menu_categories.sql",
  ),
  "utf8",
);

test("placeholder cleanup deletes only the two authorized schedule links", () => {
  assert.equal(
    migration.replace(/\s+/g, " ").trim(),
    "delete from public.daily_plates where plate_id = " +
      "'f3397e49-055c-4ebf-9a21-f28b0ac8da50'::uuid " +
      "and service_date in (date '2026-10-07', date '2026-10-08');",
  );
});

test("assignment history stores independent snapshots and backfills existing schedule rows", () => {
  assert.match(historyMigration, /create table public\.plate_assignment_history/);
  const historyTable = historyMigration.match(
    /create table public\.plate_assignment_history \(([\s\S]*?)\n\);/,
  )?.[1];
  assert.ok(historyTable);
  assert.doesNotMatch(historyTable, /references\s+public\.plates/i);
  assert.match(historyMigration, /previous_plate jsonb/);
  assert.match(historyMigration, /current_plate jsonb/);
  assert.match(historyMigration, /'name', plates\.name/);
  assert.match(historyMigration, /'description', plates\.description/);
  assert.match(historyMigration, /'price_cents', plates\.price_cents/);
  assert.match(historyMigration, /'image_url', plates\.image_url/);
  assert.match(historyMigration, /from public\.daily_plates\s+join public\.plates/);
  assert.match(historyMigration, /alter column plate_id drop not null/);
  assert.match(historyMigration, /on delete set null/);
  assert.doesNotMatch(historyMigration, /on delete cascade/i);
  assert.match(historyMigration, /event_type in \('assigned', 'changed', 'cleared', 'plate_deleted', 'backfilled'\)/);
});

test("history is owner-readable and append-only; active and future assignments block plate deletion", () => {
  assert.match(historyMigration, /grant select on table public\.plate_assignment_history to authenticated/);
  assert.match(historyMigration, /plate_assignment_history_owner_read[\s\S]*?to authenticated[\s\S]*?corne\.dawson@gmail\.com/);
  assert.match(historyMigration, /after insert or update or delete on public\.daily_plates/);
  assert.match(historyMigration, /plate_assignment_history_immutable[\s\S]*?before update or delete/);
  assert.match(historyMigration, /service_date >= \(now\(\) at time zone 'Africa\/Johannesburg'\)::date/);
  assert.match(historyMigration, /This plate is assigned for today or a future date/);
  assert.match(historyMigration, /revoke all on function public\.plate_assignment_snapshot\(uuid\)[\s\S]*?from public, anon, authenticated/);
});

test("plate deletion selects its snapshot only from that service date", () => {
  const deletionLookup = historyMigration.match(
    /into previous_snapshot\s+from public\.plate_assignment_history([\s\S]*?)limit 1;/,
  )?.[1];
  assert.ok(deletionLookup, "plate-deletion trigger loads a prior snapshot");
  assert.match(deletionLookup, /where service_date = new\.service_date/);
  assert.match(
    deletionLookup,
    /and \(\s*current_plate ->> 'id' = old\.plate_id::text\s+or previous_plate ->> 'id' = old\.plate_id::text\s*\)/,
  );
  assert.match(deletionLookup, /order by id desc/);
});

test("menu normalization preserves category order and assigns items with restrictive relationships", () => {
  const seededCategories = [...menuMigration.matchAll(
    /\('([0-9a-f-]+)', '([^']+)', (\d+)\)/g,
  )].map(([, id, name, order]) => [id, name, Number(order)]);
  assert.deepEqual(seededCategories, [
    ["20000000-0000-4000-8000-000000000001", "Toasties", 0],
    ["20000000-0000-4000-8000-000000000002", "Healthy", 1],
    ["20000000-0000-4000-8000-000000000003", "Lunch", 2],
    ["20000000-0000-4000-8000-000000000004", "Burgers", 3],
    ["20000000-0000-4000-8000-000000000005", "Singles", 4],
    ["20000000-0000-4000-8000-000000000006", "Breakfast", 5],
  ]);
  assert.match(menuMigration, /on conflict \(name\) do nothing/);
  assert.match(menuMigration, /select category, min\(category_order\) as category_order/);
  assert.match(menuMigration, /set category_id = categories\.id[\s\S]*?categories\.name = items\.category/);
  assert.match(menuMigration, /alter column category_id set not null/);
  assert.match(
    menuMigration,
    /foreign key \(category_id\)[\s\S]*?references public\.menu_categories \(id\)[\s\S]*?on delete restrict/i,
  );
  assert.match(menuMigration, /drop column category;/);
  assert.match(menuMigration, /drop column category_order;/);
  assert.match(menuMigration, /menu_categories_public_read[\s\S]*?using \(active\)/);
  assert.match(menuMigration, /menu_categories_owner_(?:read|insert|update|delete)/);
  assert.doesNotMatch(menuMigration, /on delete cascade/i);
});

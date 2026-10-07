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

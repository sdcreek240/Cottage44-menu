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

test("placeholder cleanup deletes only the two authorized schedule links", () => {
  assert.equal(
    migration.replace(/\s+/g, " ").trim(),
    "delete from public.daily_plates where plate_id = " +
      "'f3397e49-055c-4ebf-9a21-f28b0ac8da50'::uuid " +
      "and service_date in (date '2026-10-07', date '2026-10-08');",
  );
});

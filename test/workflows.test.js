import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(
  path.join(root, ".github/workflows/cloudflare-preview.yml"),
  "utf8",
);

test("Cloudflare previews use the isolated preview environment and deterministic Wrangler", () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /zipball\/refs\/pull\/\$\{PREVIEW_PR_NUMBER\}\/merge/);
  assert.match(workflow, /cp -R "\$source_dir\/docs\/\." preview\//);
  assert.match(workflow, /cp -R "\$source_dir\/functions" preview\//);
  assert.match(workflow, /environment: Cottage44_menu_preview/);
  assert.match(workflow, /npx --yes wrangler@4\.148\.0 pages deploy/);
  assert.match(workflow, /--project-name=cottage44-menu-pages/);
  assert.match(
    workflow,
    /https:\/\/pr-\$\{\{ env\.PREVIEW_PR_NUMBER \}\}\.cottage44-menu-pages\.pages\.dev/,
  );
  assert.doesNotMatch(workflow, /cloudflare\/wrangler-action/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.doesNotMatch(workflow, /allow-unsafe-pr-checkout/);
});

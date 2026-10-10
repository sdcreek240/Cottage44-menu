import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ciWorkflow = await readFile(
  path.join(root, ".github/workflows/ci.yml"),
  "utf8",
);
const branchPolicyWorkflow = await readFile(
  path.join(root, ".github/workflows/branch-policy.yml"),
  "utf8",
);
const previewWorkflow = await readFile(
  path.join(root, ".github/workflows/cloudflare-preview.yml"),
  "utf8",
);
const productionSmokeWorkflow = await readFile(
  path.join(root, ".github/workflows/production-smoke.yml"),
  "utf8",
);

test("CI is limited to the integration branches", () => {
  assert.match(ciWorkflow, /pull_request:\s+branches:\s+- dev\s+- main/s);
  assert.match(ciWorkflow, /push:\s+branches:\s+- dev\s+- main/s);
});

test("Supabase migrations use a preview project on dev and production only on main", () => {
  assert.match(
    ciWorkflow,
    /github\.ref == 'refs\/heads\/main' && 'Cottage44_menu' \|\| 'Cottage44_menu_preview'/,
  );
  assert.match(
    ciWorkflow,
    /branch-specific Supabase environment/,
  );
});

test("production release PRs must originate from dev", () => {
  assert.match(
    branchPolicyWorkflow,
    /pull_request:\s+branches:\s+- dev\s+- main/s,
  );
  assert.match(
    branchPolicyWorkflow,
    /BASE_REF.*github\.event\.pull_request\.base\.ref/s,
  );
  assert.match(
    branchPolicyWorkflow,
    /HEAD_REF.*github\.event\.pull_request\.head\.ref/s,
  );
  assert.match(
    branchPolicyWorkflow,
    /BASE_REF.*== "main".*HEAD_REF.*!= "dev"/s,
  );
});

test("Cloudflare fork previews deploy the application without unsafe checkout", () => {
  assert.match(previewWorkflow, /pull_request_target:/);
  assert.match(previewWorkflow, /workflow_dispatch:/);
  assert.match(previewWorkflow, /pr_number:/);
  assert.match(
    previewWorkflow,
    /zipball\/refs\/pull\/\$\{PREVIEW_PR_NUMBER\}\/merge/,
  );
  assert.match(previewWorkflow, /cp -R "\$source_dir\/docs\/\." preview\//);
  assert.match(previewWorkflow, /cp -R "\$source_dir\/functions" preview\//);
  assert.match(previewWorkflow, /environment: Cottage44_menu_preview/);
  assert.match(previewWorkflow, /group: cloudflare-preview\s+cancel-in-progress: false/);
  assert.match(previewWorkflow, /npx --yes wrangler@4\.148\.0 pages deploy/);
  assert.match(
    previewWorkflow,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  );
  assert.match(
    previewWorkflow,
    /pages deploy \. \\\n\s+--project-name=cottage44-menu-pages/,
  );
  assert.match(previewWorkflow, /PREVIEW_URL: \$\{\{ steps\.publish\.outputs\.deployment-url \}\}/);
  assert.match(previewWorkflow, /if: github\.event_name == 'pull_request_target'/);
  assert.match(previewWorkflow, /api\/health/);
  assert.match(previewWorkflow, /api\/plates\/today/);
  assert.match(
    previewWorkflow,
    /plates_status.*!= "200"[\s\S]*?jq -e '[\s\S]*?has\("plate"\)[\s\S]*?has\("upcoming"\)/,
  );
  assert.match(
    previewWorkflow,
    /https:\/\/pr-\$\{\{ env\.PREVIEW_PR_NUMBER \}\}\.cottage44-menu-pages\.pages\.dev/,
  );
  assert.doesNotMatch(previewWorkflow, /actions\/checkout/);
  assert.doesNotMatch(previewWorkflow, /allow-unsafe-pr-checkout/);
});

test("Cloudflare previews migrate only the verified preview project before deployment", () => {
  const downloadIndex = previewWorkflow.indexOf(
    'name: Download pull request application files',
  );
  const cliSetupIndex = previewWorkflow.indexOf('name: Set up Supabase CLI');
  const migrationIndex = previewWorkflow.indexOf(
    'name: Initialize preview Supabase database',
  );
  const deployIndex = previewWorkflow.indexOf(
    'name: Deploy Cloudflare Pages application preview',
  );
  const smokeIndex = previewWorkflow.indexOf('name: Smoke-test the deployed application');

  assert.ok(downloadIndex >= 0);
  assert.ok(downloadIndex < cliSetupIndex);
  assert.ok(cliSetupIndex < migrationIndex);
  assert.ok(migrationIndex < deployIndex);
  assert.ok(deployIndex < smokeIndex);
  assert.match(
    previewWorkflow,
    /cp -R "\$source_dir\/supabase\/migrations" \/tmp\/preview-supabase\/supabase\//,
  );
  assert.match(previewWorkflow, /supabase\/config\.toml/);
  assert.match(
    previewWorkflow,
    /working-directory: \/tmp\/preview-supabase[\s\S]*?supabase db push --linked --yes/,
  );
  assert.match(
    previewWorkflow,
    /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  );
  assert.match(
    previewWorkflow,
    /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/,
  );
  assert.match(
    previewWorkflow,
    /SUPABASE_PROJECT_REF: \$\{\{ vars\.SUPABASE_PROJECT_REF \}\}/,
  );
  assert.match(
    previewWorkflow,
    /SUPABASE_PROJECT_REF" != "kawfjlfizboizpqjcidz"[\s\S]*?supabase link[\s\S]*?supabase db push --linked --yes/,
  );
  assert.doesNotMatch(previewWorkflow, /hqhqvzhdujevjuansufo/);
  assert.doesNotMatch(previewWorkflow, /environment:\s*Cottage44_menu(?:\s|$)/);
});

test("production smoke tests wait for the Cloudflare deployment and verify the live app", () => {
  assert.match(productionSmokeWorkflow, /workflow_run:/);
  assert.match(productionSmokeWorkflow, /workflows:\s+- CI/s);
  assert.match(productionSmokeWorkflow, /branches:\s+- main/s);
  assert.match(productionSmokeWorkflow, /name == "Cloudflare Pages"/);
  assert.match(productionSmokeWorkflow, /completed:success/);
  assert.match(productionSmokeWorkflow, /https:\/\/menu\.cottage44\.co\.za/);
  assert.match(productionSmokeWorkflow, /api\/health/);
  assert.match(productionSmokeWorkflow, /Cottage 44/);
  assert.match(productionSmokeWorkflow, /exit 1/);
});

test("production smoke tests today's public plates endpoint and its nullable response shape", () => {
  assert.match(productionSmokeWorkflow, /PRODUCTION_URL\}\/api\/plates\/today/);
  assert.match(
    productionSmokeWorkflow,
    /plates_status="\$\(curl[\s\S]*?--output \/tmp\/production-plates-today\.json[\s\S]*?--write-out '%\{http_code\}'[\s\S]*?\)"/,
  );
  assert.match(productionSmokeWorkflow, /if \[\[ "\$plates_status" != "200" \]\]/);
  assert.match(
    productionSmokeWorkflow,
    /jq -e '[\s\S]*?has\("plate"\)[\s\S]*?has\("upcoming"\)/,
  );
  assert.doesNotMatch(
    productionSmokeWorkflow,
    /jq -e '[^'\n]*(?:\.plate|\.nextPlate)\s*!=\s*null/,
  );
});
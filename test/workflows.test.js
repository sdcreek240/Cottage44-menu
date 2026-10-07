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

test("CI is limited to the integration branches", () => {
  assert.match(ciWorkflow, /pull_request:\s+branches:\s+- dev\s+- main/s);
  assert.match(ciWorkflow, /push:\s+branches:\s+- dev\s+- main/s);
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
  assert.match(previewWorkflow, /environment: Cottage44_menu/);
  assert.match(previewWorkflow, /wranglerVersion: 4\.148\.0/);
  assert.match(previewWorkflow, /pages deploy \. --project-name=cottage44-menu-pages/);
  assert.match(previewWorkflow, /api\/health/);
  assert.match(
    previewWorkflow,
    /https:\/\/pr-\$\{\{ env\.PREVIEW_PR_NUMBER \}\}\.cottage44-menu-pages\.pages\.dev/,
  );
  assert.doesNotMatch(previewWorkflow, /actions\/checkout/);
  assert.doesNotMatch(previewWorkflow, /allow-unsafe-pr-checkout/);
});

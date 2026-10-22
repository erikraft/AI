import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/cloudflare-deploy.yml", import.meta.url), "utf8");

test("retired Cloudflare workflow cannot issue a deploy-hook request", () => {
  assert.match(workflow, /if:\s*\$\{\{\s*false\s*\}\}/);
  assert.doesNotMatch(workflow, /\bcurl\b|CLOUDFLARE_DEPLOY_HOOK|api\.cloudflare\.com/i);
});

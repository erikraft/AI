import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workflowDir = join(root, ".github", "workflows");

test("Vercel is the only web deployment configuration", () => {
  assert.equal(existsSync(join(root, "vercel.json")), true, "vercel.json must remain present");
  assert.equal(existsSync(join(root, "wrangler.toml")), false, "legacy Wrangler configuration must be absent");
  assert.equal(existsSync(join(root, "wrangler.json")), false, "legacy Wrangler configuration must be absent");
  assert.equal(existsSync(join(root, "wrangler.jsonc")), false, "legacy Wrangler configuration must be absent");
  assert.equal(existsSync(join(root, "cloudflare")), false, "legacy Cloudflare deployment directory must be absent");

  if (!existsSync(workflowDir)) return;
  const workflowFiles = readdirSync(workflowDir).filter((name) => /\.(yml|yaml)$/i.test(name));
  for (const name of workflowFiles) {
    const content = readFileSync(join(workflowDir, name), "utf8");
    assert.doesNotMatch(
      content,
      /wrangler|cloudflare.{0,40}(worker|deploy|deployment)|(?:worker|deploy|deployment).{0,40}cloudflare/i,
      `obsolete Cloudflare deployment configuration found in .github/workflows/${name}`
    );
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMcpUrl } from "../api/_lib/mcp-network.js";

test("custom MCP URLs reject loopback, private, link-local, and reserved IP ranges", async () => {
  const blocked = [
    "https://0.0.0.0/",
    "https://10.1.2.3/",
    "https://127.0.0.1/",
    "https://169.254.10.20/",
    "https://192.0.2.10/",
    "https://198.51.100.2/",
    "https://203.0.113.7/",
    "https://224.0.0.1/",
    "https://[::]/",
    "https://[::1]/",
    "https://[::ffff:7f00:1]/",
    "https://[2001:db8::1]/",
    "https://[fc00::1]/",
    "https://[fe80::1]/",
    "https://[ff02::1]/"
  ];
  for (const url of blocked) {
    await assert.rejects(
      () => validateMcpUrl(url),
      /Private or reserved|Local and reserved|public HTTPS URL/,
      url
    );
  }
});

test("custom MCP URLs reject local names, embedded credentials, and fragments", async () => {
  for (const url of [
    "https://localhost/mcp",
    "https://host.localhost/mcp",
    "https://user:password@example.com/mcp",
    "https://example.com/mcp#fragment"
  ]) {
    await assert.rejects(() => validateMcpUrl(url), /Local and reserved|public HTTPS URL/, url);
  }
});

test("MCP transport pins each HTTPS request to the validated public DNS address", () => {
  const network = readFileSync(new URL("../api/_lib/mcp-network.js", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../api/_lib/mcp.js", import.meta.url), "utf8");
  assert.match(network, /BLOCKED_IP_RANGES = new BlockList\(\)/);
  assert.match(network, /lookup\(hostname, \{ all: true, verbatim: true \}\)/);
  assert.match(network, /requestPinnedMcp\(target, headers, JSON\.stringify\(body\)\)/);
  assert.match(network, /httpsRequest\(target\.url/);
  assert.match(network, /lookup: ipLookup/);
  assert.match(network, /address: target\.address/);
  assert.doesNotMatch(network, /fetch\(url,\s*\{/);
  assert.match(helper, /resolveMcpTarget, requestPinnedMcp, validateMcpUrl/);
});

test("MCP collection lookups use owner/date and owner/server indexes", () => {
  const helper = readFileSync(new URL("../api/_lib/mcp.js", import.meta.url), "utf8");
  assert.match(helper, /mcp_servers_by_owner_and_date/);
  assert.match(helper, /mcp_server_by_owner_and_id/);
  assert.match(helper, /createIndex\(\{ userId: 1, createdAt: -1 \}/);
  assert.match(helper, /createIndex\(\{ userId: 1, serverId: 1 \}/);
});

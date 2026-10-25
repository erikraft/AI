import test from "node:test";
import assert from "node:assert/strict";
import mcpHandler from "../api/mcp.js";

function makeResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; }
  };
}

async function callMcp(body, method = "POST", authorized = true) {
  const res = makeResponse();
  const token = "test-firebase-token-for-unit-tests";
  const req = { method, body, headers: authorized ? { authorization: "Bearer " + token } : {} };
  await mcpHandler(req, res, async (received) => {
    assert.equal(received, token);
    return { uid: "test-user" };
  });
  return res;
}

test("MCP endpoint accepts only POST and disables caching", async () => {
  const response = await callMcp({}, "GET");
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST, OPTIONS");
  assert.equal(response.headers["access-control-allow-origin"], "https://chatgpt.com");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("MCP endpoint rejects requests without an OAuth bearer token", async () => {
  const response = await callMcp({ jsonrpc: "2.0", id: 1, method: "initialize" }, "POST", false);
  assert.equal(response.statusCode, 401);
  assert.match(response.headers["www-authenticate"], /oauth-protected-resource/);
});

test("MCP endpoint rejects malformed JSON-RPC requests after authentication", async () => {
  const response = await callMcp({ jsonrpc: "1.0", id: 1, method: "initialize" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, -32600);
});

test("initialize negotiates a supported protocol and documents OAuth PKCE", async () => {
  const response = await callMcp({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.protocolVersion, "2025-06-18");
  assert.equal(response.body.result.serverInfo.name, "erikraft-ai");
  assert.match(response.body.result.instructions, /OAuth 2.0 Authorization Code with PKCE/);
  assert.match(response.body.result.instructions, /Never ask users to paste tokens or passwords into chat/);
});

test("tools list exposes the current model catalog without token arguments", async () => {
  const response = await callMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = response.body.result.tools;
  const generate = tools.find((tool) => tool.name === "erikraft_ai_generate");
  assert.ok(generate);
  assert.ok(generate.inputSchema.properties.model.enum.includes("AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF"));
  assert.deepEqual(generate._meta.ui.visibility, ["app"]);
  assert.equal(Object.hasOwn(generate.inputSchema.properties, "firebaseIdToken"), false);
  for (const name of ["erikraft_ai_get_profile_photo", "erikraft_ai_save_profile_photo", "erikraft_ai_delete_profile_photo", "erikraft_ai_restore_provider_photo"]) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, name);
    assert.deepEqual(tool._meta.ui.visibility, ["app"]);
  }
});

test("studio resource removes the manually pasted Firebase token field", async () => {
  const response = await callMcp({
    jsonrpc: "2.0", id: 3, method: "resources/read",
    params: { uri: "ui://erikraft-ai/studio-v1.html" }
  });
  const html = response.body.result.contents[0].text;
  assert.match(html, /AtomicChat\/Qwen-Image-2\.1-Turbo-Uncensored-GGUF/);
  assert.doesNotMatch(html, /id="token"/);
  assert.doesNotMatch(html, /Firebase session token/);
  assert.match(html, /ChatGPT connection dialog/);
});

test("MCP endpoint supports ChatGPT CORS preflight without executing a tool", async () => {
  const response = await callMcp({}, "OPTIONS");
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(response.headers["access-control-allow-origin"], "https://chatgpt.com");
  assert.equal(response.headers["access-control-allow-methods"], "POST, OPTIONS");
  assert.match(response.headers["access-control-allow-headers"], /mcp-protocol-version/);
  assert.match(response.headers["access-control-allow-headers"], /authorization/);
});

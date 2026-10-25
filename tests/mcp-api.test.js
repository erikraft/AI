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

async function callMcp(body, method = "POST") {
  const res = makeResponse();
  await mcpHandler({ method, body }, res);
  return res;
}

test("MCP endpoint accepts only POST and disables caching", async () => {
  const response = await callMcp({}, "GET");
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("MCP endpoint rejects malformed JSON-RPC requests", async () => {
  const response = await callMcp({ jsonrpc: "1.0", id: 1, method: "initialize" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, -32600);
});

test("initialize negotiates a supported client protocol version", async () => {
  const response = await callMcp({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.protocolVersion, "2025-06-18");
  assert.equal(response.body.result.serverInfo.name, "erikraft-ai");
});

test("tools list includes the complete current model catalog without exposing auth tools to the model", async () => {
  const response = await callMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = response.body.result.tools;
  const generate = tools.find((tool) => tool.name === "erikraft_ai_generate");
  assert.ok(generate);
  assert.ok(generate.inputSchema.properties.model.enum.includes("AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF"));
  assert.deepEqual(generate._meta.ui.visibility, ["app"]);
  for (const name of ["erikraft_ai_get_profile_photo", "erikraft_ai_save_profile_photo", "erikraft_ai_delete_profile_photo", "erikraft_ai_restore_provider_photo"]) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, name);
    assert.deepEqual(tool._meta.ui.visibility, ["app"]);
  }
});

test("studio resource contains Qwen Image and account-photo controls", async () => {
  const response = await callMcp({
    jsonrpc: "2.0", id: 3, method: "resources/read",
    params: { uri: "ui://erikraft-ai/studio-v1.html" }
  });
  const html = response.body.result.contents[0].text;
  assert.match(html, /AtomicChat\/Qwen-Image-2\.1-Turbo-Uncensored-GGUF/);
  assert.match(html, /profile-save/);
  assert.match(html, /profile-delete/);
  assert.match(html, /textOnly=m\.includes\("0bserverx\/Qwen3\.8"\)/);
});

test("generation without a Firebase token fails before proxying inference", async () => {
  const response = await callMcp({
    jsonrpc: "2.0", id: 4, method: "tools/call",
    params: { name: "erikraft_ai_generate", arguments: { prompt: "test" } }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.result.isError, true);
  assert.match(response.body.result.content[0].text, /Firebase ID token/);
});

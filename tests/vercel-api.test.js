import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import modelsHandler from "../api/models.js";
import healthHandler from "../api/health.js";

const MODEL_COSMOS = "DuoNeural/Cosmos3-Nano-Abliterated";
const MODEL_QWEN = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF";
const SECRET = "test-secret-that-is-long-enough-to-pass-32-characters";

function callHandler(handler, method = "GET") {
  const response = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  handler({ method, headers: {} }, response);
  return response;
}

function withEnv(values, run) {
  const keys = Object.keys(values);
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Vercel config restores clean URLs, Fluid Compute, and the Hobby max duration", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.cleanUrls, true);
  assert.equal(config.fluid, true);
  assert.equal(config.functions["api/generate.js"].maxDuration, 300);
  assert.ok(config.headers.some((entry) => entry.source === "/assets/(.*)"));
});

test("model API reports experimental routes fail-closed without backend credentials", () => {
  withEnv({
    HF_SPACE_ID: null,
    HF_SPACE_API_SECRET: null,
    ENABLE_COSMOS_VIDEO: null,
    ENABLE_QWEN_TEXT: null
  }, () => {
    const response = callHandler(modelsHandler);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.models[MODEL_COSMOS], false);
    assert.equal(response.body.models[MODEL_QWEN], false);
    assert.equal(response.body.selectableModels.length, 4);
    assert.equal(response.body.runtimeChecksRequired, true);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  });
});

test("experimental model flags default on when backend credentials are configured", () => {
  withEnv({
    HF_SPACE_ID: "ErikrafT/erikraft-ai",
    HF_SPACE_API_SECRET: SECRET,
    ENABLE_COSMOS_VIDEO: null,
    ENABLE_QWEN_TEXT: null
  }, () => {
    const response = callHandler(modelsHandler);
    assert.equal(response.body.models[MODEL_COSMOS], true);
    assert.equal(response.body.models[MODEL_QWEN], true);
  });
});

test("an explicit false value disables only its own experimental route", () => {
  withEnv({
    HF_SPACE_ID: "ErikrafT/erikraft-ai",
    HF_SPACE_API_SECRET: SECRET,
    ENABLE_COSMOS_VIDEO: "false",
    ENABLE_QWEN_TEXT: "true"
  }, () => {
    const response = callHandler(modelsHandler);
    assert.equal(response.body.models[MODEL_COSMOS], false);
    assert.equal(response.body.models[MODEL_QWEN], true);
  });
});

test("health endpoint returns configuration booleans without credential contents", () => {
  const credentials = JSON.stringify({
    project_id: "erikraft-account",
    client_email: "test@erikraft-account.iam.gserviceaccount.com",
    private_key: "not-a-real-private-key"
  });
  withEnv({
    FIREBASE_SERVICE_ACCOUNT_JSON: credentials,
    HF_SPACE_ID: "ErikrafT/erikraft-ai",
    HF_TOKEN: "hf-test-token",
    HF_SPACE_API_SECRET: SECRET,
    ENABLE_COSMOS_VIDEO: "true",
    ENABLE_QWEN_TEXT: "true"
  }, () => {
    const response = callHandler(healthHandler);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.firebaseProjectMatches, true);
    assert.equal(response.body.hfSpaceIdValid, true);
    assert.equal(response.body.experimentalModels.cosmosVideo, true);
    assert.equal(response.body.experimentalModels.qwenText, true);
    assert.equal(response.body.inferenceTested, false);
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(credentials), false);
    assert.equal(serialized.includes("hf-test-token"), false);
    assert.equal(serialized.includes(SECRET), false);
    assert.equal(response.headers["cache-control"], "no-store");
  });
});

test("health and model endpoints reject unsupported methods", () => {
  withEnv({}, () => {
    const health = callHandler(healthHandler, "POST");
    const models = callHandler(modelsHandler, "POST");
    assert.equal(health.statusCode, 405);
    assert.equal(models.statusCode, 405);
    assert.equal(health.headers.allow, "GET");
    assert.equal(models.headers.allow, "GET");
  });
});

test("experimental inference has a bounded server-side timeout and actionable timeout response", () => {
  const source = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
  assert.match(source, /EXPERIMENTAL_INFERENCE_TIMEOUT_MS\\s*=\\s*235_000/);
  assert.match(source, /predictWithTimeout\\(client, "\\/generate_video"/);
  assert.match(source, /predictWithTimeout\\(client, "\\/generate_text"/);
  assert.match(source, /InferenceTimeoutError/);
  assert.match(source, /status\\(timedOut \\? 504 : 503\\)/);
});

test("Vercel deployment excludes repository-only backend source and test files", () => {
  const ignore = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8");
  for (const entry of ["cloudflare", "huggingface", ".github", "tests", "wrangler.jsonc", ".env.example"]) {
    assert.ok(ignore.split(String.fromCharCode(10)).map((line) => line.trim()).includes(entry), `missing ${entry} from .vercelignore`);
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, "24.x");
  assert.ok(pkg.dependencies["@gradio/client"]);
  assert.ok(pkg.dependencies["firebase-admin"]);
});

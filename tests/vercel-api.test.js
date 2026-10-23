import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import modelsHandler from "../api/models.js";
import healthHandler from "../api/health.js";
import accountHandler from "../api/account.js";

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
    assert.equal(response.body.selectableModels.length, 5);
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
  assert.ok(source.includes("EXPERIMENTAL_INFERENCE_TIMEOUT_MS = 235_000"));
  assert.ok(source.includes("SPACE_CONNECT_TIMEOUT_MS = 30_000"));
  assert.ok(source.includes("Client.connect(targetSpaceId, clientOptions)"));
  assert.ok(source.includes("Timed out connecting to the Hugging Face Space."));
  assert.ok(source.includes('predictWithTimeout(client, "/generate_video"'));
  assert.ok(source.includes('predictWithTimeout(client, "/generate_text"'));
  assert.ok(source.includes("InferenceTimeoutError"));
  assert.ok(source.includes("status(timedOut ? 504 : 503)"));
});

test("Vercel deployment excludes repository-only backend source and test files", () => {
  const ignore = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8");
  for (const entry of ["huggingface", ".github", "tests", ".env.example"]) {
    assert.ok(ignore.split(String.fromCharCode(10)).map((line) => line.trim()).includes(entry), `missing ${entry} from .vercelignore`);
  }
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, "24.x");
  assert.ok(pkg.dependencies["@gradio/client"]);
  assert.ok(pkg.dependencies["firebase-admin"]);
});


test("account deletion endpoint only accepts DELETE and requires authentication", async () => {
  const response = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await accountHandler({ method: "POST", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "DELETE");

  const unauthenticated = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await accountHandler({ method: "DELETE", headers: {} }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.body.error, "Authentication required.");
  assert.equal(unauthenticated.headers["cache-control"], "no-store");
});

test("account deletion removes user-owned MongoDB records and deletes Firebase Auth last", () => {
  const source = readFileSync(new URL("../api/account.js", import.meta.url), "utf8");
  assert.match(source, /listCollections\\(\\{\\}\\)/);
  assert.match(source, /deleteMany\(\{ userId: uid \}\)/);
  assert.match(source, /deleteMongoUserData\(db, user\.uid\);[\s\S]*deleteUser\(user\.uid\)/);
  assert.match(source, /RECENT_AUTH_SECONDS = 5 \* 60/);
  assert.match(source, /verifyIdToken\(match\[1\], true\)/);
});

test("model discovery supports bilingual search terms and task filters", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
  assert.match(html, /id="model-search"/);
  assert.match(html, /id="model-task-filter"/);
  assert.match(html, /gerar texto/);
  assert.match(html, /chatbot/);
  assert.match(html, /generate text/);
  assert.match(app, /normalize\("NFD"\)/);
  assert.match(app, /filterModels\(\)/);
});

test("account deletion dialog warns about profile photos and generation history in both locales", () => {
  const profile = readFileSync(new URL("../assets/js/profile.js", import.meta.url), "utf8");
  assert.match(profile, /Fotos de perfil personalizadas/);
  assert.match(profile, /Custom profile photos/);
  assert.match(profile, /Histórico de conversas e de gerações de imagens, vídeos e áudios/);
  assert.match(profile, /Conversation history and image, video, and audio generation history/);
  assert.match(profile, /viewBox="0 0 576 512"/);
});

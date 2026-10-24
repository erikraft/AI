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
  assert.ok(source.includes("QWEN_INFERENCE_TIMEOUT_MS = 235_000"));
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


test("account deletion endpoint only accepts DELETE and requires a verified token", () => {
  const source = readFileSync(new URL("../api/account.js", import.meta.url), "utf8");
  assert.match(source, /req\.method !== "DELETE"/);
  assert.match(source, /res\.setHeader\("Allow", "DELETE"\)/);
  assert.match(source, /verifyIdToken\(match\[1\], true\)/);
  assert.match(source, /if \(!user\) return res\.status\(401\)/);
  assert.match(source, /setHeader\("Cache-Control", "no-store"\)/);
});

test("account deletion removes user-owned MongoDB records and deletes Firebase Auth last", () => {
  const source = readFileSync(new URL("../api/account.js", import.meta.url), "utf8");
  assert.match(source, /listCollections\(\{\}\)/);
  assert.match(source, /deleteMany\(\{ userId: uid \}\)/);
  assert.match(source, /getFirestore\(adminApp\(\)\)\.collection\("generation_limits"\)\.doc\(user\.uid\)\.delete\(\)/);
  assert.match(source, /deleteMongoUserData\(db, user\.uid\);[\s\S]*generation_limits[\s\S]*deleteUser\(user\.uid\)/);
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
  assert.match(profile, /Conversas com a IA, prompts, respostas e histórico de geração de imagens, vídeos e áudios/);
  assert.match(profile, /AI conversations, prompts, responses, and image, video, and audio generation history/);
  assert.match(profile, /viewBox="0 0 576 512"/);
});


function assertExactHttpsLink(source, expectedUrl) {
  const expected = new URL(expectedUrl);
  const attributeValues = [...source.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)]
    .map((match) => match[2]);
  const found = attributeValues.some((value) => {
    try {
      const parsed = new URL(value);
      return parsed.href === expected.href
        && parsed.protocol === "https:"
        && parsed.hostname === expected.hostname
        && parsed.port === ""
        && parsed.username === ""
        && parsed.password === ""
        && parsed.search === ""
        && parsed.hash === "";
    } catch {
      return false;
    }
  });
  assert.ok(found, `Expected an exact HTTPS link to ${expectedUrl}`);
}

test("history supports owner-scoped bulk deletion and hides private history from signed-out visitors", () => {
  const api = readFileSync(new URL("../api/history.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/css/styles.css", import.meta.url), "utf8");
  assert.match(api, /deleteMany\(\{ userId: user\.uid \}\)/);
  assert.match(api, /const deleteAll = String\(req\.query\?\.all \|\| req\.body\?\.all/);
  assert.match(api, /const messages = cleanMessages\(body\.messages\)/);
  assert.match(html, /id="history-panel" class="panel history-panel hidden"[^>]*inert/);
  assert.match(html, /id="history-delete-all-modal"/);
  assert.match(html, /viewBox="0 0 576 512"/);
  assert.match(app, /historyRequest\("DELETE", \{ all: true \}\)/);
  assert.match(app, /historyPanel\?\.classList\.toggle\("hidden", !authenticated\)/);
  assert.match(app, /history-chat-message/);
  assert.match(app, /generatedDate:\["Gerado em","Generated on"\]/);
  assert.match(app, /conversationDate:\["Conversa em","Conversation on"\]/);
  assert.match(app, /item\.type === "text" \? "conversationDate" : "generatedDate"/);
  assert.match(app, /new Intl\.DateTimeFormat\(locale, \{ dateStyle: "medium", timeStyle: "short" \}\)/);
  assert.match(css, /\.prompt-panel:not\(\.hidden\) #image-options-row/);
  assert.match(css, /\.prompt-panel:not\(\.hidden\) #generate/);
});

test("account deletion and legal pages disclose Hugging Face provider-side retention in both languages", () => {
  const profile = readFileSync(new URL("../assets/js/profile.js", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  const terms = readFileSync(new URL("../terms.html", import.meta.url), "utf8");
  for (const source of [profile, privacy, terms]) {
    assertExactHttpsLink(source, "https://huggingface.co/privacy");
    assertExactHttpsLink(source, "https://huggingface.co/terms-of-service");
  }
  assert.match(profile, /Prompts and inputs sent to Hugging Face/);
  assert.match(privacy, /does <strong>not automatically delete/);
  assert.match(privacy, /não apaga automaticamente/);
  assert.match(privacy, /23 de outubro de 2026/);
  assert.match(privacy, /October 23, 2026/);
});

test("localized interface text is rendered without reinterpreting translations as HTML", () => {
  const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
  assert.equal(app.includes("innerHTML"), false);
  assert.ok(app.includes("Object.prototype.hasOwnProperty.call(dict, key)"));
  assert.ok(app.includes("el.textContent = dict[key]"));
  assert.ok(app.includes("hero_title_emphasis"));
  assert.ok(app.includes("studio_title_accent"));
});

test("experimental Space tabs are hidden from the public UI while server-side authorization remains required", () => {
  const source = readFileSync(new URL("../huggingface/app.py", import.meta.url), "utf8");
  assert.match(source, /with gr\.Tab\("Cosmos3 Nano text-to-video", visible=False\)/);
  assert.match(source, /with gr\.Tab\("Qwen3\.8 text assistant", visible=False\)/);
  assert.match(source, /_authorize_experimental_api\(api_secret\)/);
  assert.match(source, /server-side shared secret/);
  assert.match(source, /from this public Space interface/);
  assert.match(source, /text_button\.click\(generate_text,[\s\S]*?api_name=["']generate_text["']/);
});

test("voice cloning remains available and confines reference audio to Gradio's cache", () => {
  const source = readFileSync(new URL("../huggingface/app.py", import.meta.url), "utf8");
  assert.match(source, /with gr\.Tab\("Voice cloning \/ Clonagem de voz"\)/);
  assert.match(source, /cache_root = os\.path\.realpath\(os\.fspath\(cache_dir\)\)/);
  assert.match(source, /audio_path = os\.path\.realpath\(reference_audio\)/);
  assert.match(source, /os\.path\.commonpath\(\(cache_root, audio_path\)\)/);
  assert.match(source, /Client\("hf-audio\/whisper-large-v3", verbose=False\)/);
  assert.match(source, /_detect_reference_language\(safe_reference_audio\)/);
  assert.match(source, /Client\("Nymbo\/Voice-Clone-Multilingual", verbose=False\)/);
  assert.match(source, /language,\s*api_name=["\']\/predict["\']/);
});

test("voice-cloning reference audio is confined to Gradio's resolved cache path", () => {
  const source = readFileSync(new URL("../huggingface/app.py", import.meta.url), "utf8");
  assert.ok(source.includes("cache_root = os.path.realpath(os.fspath(cache_dir))"));
  assert.ok(source.includes("audio_path = os.path.realpath(reference_audio)"));
  assert.ok(source.includes("os.path.commonpath((cache_root, audio_path))"));
  assert.ok(source.includes("audio_path.startswith(cache_prefix)"));
  assert.ok(source.includes("os.path.isfile(audio_path)"));
  assert.ok(source.includes("audio_size = os.path.getsize(audio_path)"));
  assert.ok(source.includes("handle_file(safe_reference_audio)"));
  assert.equal(source.includes("Path(reference_audio).resolve"), false);
  assert.equal(source.includes("os.path.isfile(reference_audio)"), false);
  assert.equal(source.includes("os.path.getsize(reference_audio)"), false);
});

test("voice preview only accepts supported audio MIME types and uses a normalized Blob URL", () => {
  const app = readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
  const api = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
  assert.ok(app.includes("const SUPPORTED_VOICE_AUDIO_TYPES = new Set(["));
  assert.ok(app.includes("if (!SUPPORTED_VOICE_AUDIO_TYPES.has(mimeType))"));
  assert.ok(app.includes("new Blob([file], { type: mimeType })"));
  assert.ok(app.includes('if (!previewUrl.startsWith("blob:"))'));
  assert.ok(app.includes("`data:${mimeType};base64,${dataUrl[1]}`"));
  assert.ok(api.includes("(?:wav|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a)"));
});

test("voice cloning detects language from reference speech instead of website locale", () => {
  const api = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.dependencies["franc-min"]);
  assert.ok(api.includes('const VOICE_LANGUAGE_SPACE_ID = "hf-audio/whisper-large-v3"'));
  assert.ok(api.includes('const VOICE_CLONE_SPACE_ID = "Nymbo/Voice-Clone-Multilingual"'));
  assert.ok(api.includes("detectVoiceReferenceLanguage(voiceAudioFile, clientOptions)"));
  assert.ok(api.includes("franc(transcript.trim())"));
  assert.ok(api.includes("[prompt.trim(), voiceAudioFile, voiceLanguage]"));
  assert.ok(api.includes("detectedLanguage: voiceLanguage"));
  assert.ok(api.includes("UnsupportedReferenceLanguageError"));
  assert.ok(api.includes("VOICE_LANGUAGE_TIMEOUT_MS"));
});


test("custom profile photos persist in MongoDB and take precedence over provider photos", () => {
  const api = readFileSync(new URL("../api/profile.js", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../assets/js/profile.js", import.meta.url), "utf8");
  assert.match(api, /replaceOne\(\{ userId: user\.uid \}, \{ userId: user\.uid, contentType: match\[1\]\.toLowerCase\(\), data, updatedAt: new Date\(\) \}, \{ upsert: true \}\)/);
  assert.match(api, /if \(record\?\.photoDisabled\)[\s\S]*?if \(record\?\.data\)/);
  assert.match(api, /record\.data\.toString\("base64"\)/);
  assert.match(profile, /request\("PUT", \{ photo \}\)/);
  assert.match(profile, /data\.photoDisabled \? "" : \(data\.photo \|\| providerPhotoFromUser\(user\)\)/);
});


test("voice-cloning integration failures identify the failing upstream phase without mislabeling quota", () => {
  const source = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
  assert.match(source, /phase === "voice-language-detection" \|\| phase === "space-voice-clone"/);
  assert.match(source, /voice-cloning Space failed during synthesis/);
  assert.match(source, /Voice cloning exceeded the provider timeout/);
  assert.match(source, /This does not confirm quota exhaustion/);
});


test("voice cloning reports ZeroGPU per-request duration failures separately from account quota", () => {
  const source = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
  assert.match(source, /phase === "space-voice-clone" && \/requested gpu duration/);
  assert.match(source, /per-request GPU duration limit/);
  assert.match(source, /This does not confirm that your account quota is exhausted/);
  assert.match(source, /console\.error\("\[image-generation:voice-language-detection\]"/);
});

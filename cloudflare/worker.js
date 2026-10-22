/**
 * ErikrafT AI — Cloudflare Workers API and static-asset boundary.
 * Secrets are read only from Worker bindings; never expose them to the browser.
 */
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const FLUX_MODEL = "aoxo/flux.1dev-abliterated";
const QWYTHOS_MODEL = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated";
const COSMOS_MODEL = "DuoNeural/Cosmos3-Nano-Abliterated";
const QWEN_MODEL = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF";
const MAX_PROMPT = 1500;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_LIMIT = 5;
const FIREBASE_CERTS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}
function b64url(bytes) {
  const binary = typeof bytes === "string" ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function encodeJson(value) { return b64url(JSON.stringify(value)); }
function fromB64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
}
function pemToBytes(pem) {
  return Uint8Array.from(atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")), c => c.charCodeAt(0));
}
async function firebaseUser(idToken, projectId) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("invalid-token");
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch { throw new Error("invalid-token"); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid || claims.aud !== projectId ||
      claims.iss !== "https://securetoken.google.com/" + projectId ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 300 ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > now + 300) {
    throw new Error("invalid-token");
  }
  const keyResponse = await fetch(FIREBASE_CERTS, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!keyResponse.ok) throw new Error("auth-provider-unavailable");
  const jwks = await keyResponse.json();
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid && key.alg === "RS256");
  if (!jwk) throw new Error("invalid-token");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), signed)) throw new Error("invalid-token");
  const provider = claims.firebase?.sign_in_provider;
  if (!["google.com", "github.com", "password"].includes(provider)) throw new Error("unsupported-provider");
  if (provider === "password" && claims.email_verified !== true) throw new Error("email-not-verified");
  return { uid: claims.sub, projectId, provider };
}
async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = encodeJson({ alg: "RS256", typ: "JWT" }) + "." + encodeJson({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  });
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(assertion));
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion + "." + b64url(signature) })
  });
  if (!response.ok) throw new Error("firestore-auth-failed");
  return (await response.json()).access_token;
}
function firestoreValue(value) {
  if (!value) return null;
  if (value.timestampValue) return Date.parse(value.timestampValue);
  if (value.integerValue !== undefined) return Number(value.integerValue);
  return null;
}
async function reserveQuota(env, user) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("firebase-service-account-missing");
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = serviceAccount.project_id || user.projectId;
  if (projectId !== user.projectId) throw new Error("firebase-project-mismatch");
  const token = await googleAccessToken(serviceAccount);
  const base = "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/databases/(default)/documents";
  const docName = base + "/generation_limits/" + encodeURIComponent(user.uid);
  const begin = await fetch(base + ":beginTransaction", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  if (!begin.ok) throw new Error("firestore-transaction-failed");
  const { transaction } = await begin.json();
  let count = 0, windowStartedAt = 0, exists = false;
  try {
    const read = await fetch(docName + "?transaction=" + encodeURIComponent(transaction), { headers: { Authorization: "Bearer " + token } });
    if (read.ok) {
      const doc = await read.json();
      exists = true;
      count = firestoreValue(doc.fields?.count) || 0;
      windowStartedAt = firestoreValue(doc.fields?.windowStartedAt) || 0;
    } else if (read.status !== 404) {
      throw new Error("firestore-read-failed");
    }
    const now = Date.now();
    if (windowStartedAt <= now - WINDOW_MS) { count = 0; windowStartedAt = now; }
    if (count >= ACCOUNT_LIMIT) {
      await fetch(base + ":rollback", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ transaction }) });
      return { allowed: false, remaining: 0, resetAt: windowStartedAt + WINDOW_MS };
    }
    count += 1;
    const document = {
      name: docName,
      fields: {
        count: { integerValue: String(count) },
        windowStartedAt: { timestampValue: new Date(windowStartedAt).toISOString() },
        updatedAt: { timestampValue: new Date(now).toISOString() }
      }
    };
    const commit = await fetch(base + ":commit", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        writes: [{
          update: document,
          updateMask: { fieldPaths: ["count", "windowStartedAt", "updatedAt"] },
          currentDocument: exists ? { exists: true } : { exists: false }
        }]
      })
    });
    if (!commit.ok) {
      const details = await commit.text();

      console.error("[firestore-commit-debug]", {
        status: commit.status,
        details: details.slice(0, 2000)
      });

      throw new Error("firestore-commit-failed");
    }
    return { allowed: true, remaining: ACCOUNT_LIMIT - count, resetAt: windowStartedAt + WINDOW_MS, count, windowStartedAt };
  } catch (error) {
    await fetch(base + ":rollback", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ transaction }) }).catch(() => {});
    throw error;
  }
}
async function hfCall(env, apiName, data) {
  const configuredSpaceId = typeof env.HF_SPACE_ID === "string" ? env.HF_SPACE_ID.trim() : "";
  if (!configuredSpaceId) throw new Error("hf-space-id-missing");
  if (configuredSpaceId.toLowerCase() !== "erikraft/erikraft-ai") throw new Error("invalid-space-id");
  const host = "https://erikraft-erikraft-ai.hf.space";
  const headers = { "Content-Type": "application/json" };
  if (env.HF_TOKEN) headers.Authorization = "Bearer " + env.HF_TOKEN;
  const start = await fetch(host + "/gradio_api/call/" + apiName, {
    method: "POST", headers, body: JSON.stringify({ data })
  });
  if (!start.ok) throw new Error("hf-start-" + start.status);
  const started = await start.json();
  if (!started.event_id) throw new Error("hf-missing-event-id");
  const result = await fetch(host + "/gradio_api/call/" + apiName + "/" + encodeURIComponent(started.event_id), {
    headers: env.HF_TOKEN ? { Authorization: "Bearer " + env.HF_TOKEN } : {}
  });
  if (!result.ok) throw new Error("hf-result-" + result.status);
  const stream = await result.text();
  const events = stream.split("\n").filter(line => line.startsWith("data:"));
  for (let i = events.length - 1; i >= 0; i--) {
    try {
      const payload = JSON.parse(events[i].slice(5).trim());
      if (payload?.error) throw new Error("hf-inference-failed");
      if (Array.isArray(payload?.data)) return payload.data;
    } catch (error) {
      if (String(error?.message).includes("hf-inference-failed")) throw error;
    }
  }
  throw new Error("hf-empty-result");
}
function getOutputUrl(output, mediaType = "image") {
  const first = output?.[0];
  const url = typeof first === "string"
    ? first
    : mediaType === "video"
      ? first?.url || first?.path || first?.video?.url || first?.video?.path || first?.video || first?.value?.url || first?.value?.path
      : first?.url || first?.image?.url || first?.image?.path || first?.path || first?.value?.url;
  if (typeof url !== "string" || !url) throw new Error("hf-invalid-output");
  const host = "https://erikraft-erikraft-ai.hf.space";
  if (url.startsWith("/")) return host + url;
  if (!/^https:\/\//i.test(url)) return host + "/" + url.replace(/^\/+/, "");
  const parsed = new URL(url);
  const allowedHost = parsed.hostname === "erikraft-erikraft-ai.hf.space" || parsed.hostname === "huggingface.co" || parsed.hostname.endsWith(".huggingface.co");
  if (!allowedHost) throw new Error("hf-untrusted-output-url");
  return parsed.toString();
}
async function uploadReferenceImage(env, dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error("invalid-reference-image");
  const binary = fromB64url(b64url(Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))));
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error("invalid-reference-image");
  const mime = "image/" + match[1].toLowerCase();
  const form = new FormData();
  form.append("files", new Blob([binary], { type: mime }), "reference-image." + (match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()));
  const headers = env.HF_TOKEN ? { Authorization: "Bearer " + env.HF_TOKEN } : {};
  const response = await fetch("https://erikraft-erikraft-ai.hf.space/gradio_api/upload", { method: "POST", headers, body: form });
  if (!response.ok) throw new Error("hf-upload-" + response.status);
  const paths = await response.json();
  if (!Array.isArray(paths) || typeof paths[0] !== "string") throw new Error("hf-upload-invalid-result");
  return { path: paths[0] };
}
async function generate(request, env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return json({
    error: "O Worker não recebeu o Secret FIREBASE_SERVICE_ACCOUNT_JSON. Configure-o em Cloudflare → Workers & Pages → erikraft-ai → Settings → Variables and Secrets, no ambiente que está atendendo este domínio (Production e, se usar, Preview), e publique novamente."
  }, 503);
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return json({ error: "Entre na sua conta para gerar imagens." }, 401);
  let body;
  try {
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 4_500_000) return json({ error: "A solicitação excede o limite de tamanho." }, 413);
    if (!request.body) return json({ error: "Corpo JSON inválido." }, 400);
    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 4_500_000) {
        await reader.cancel();
        return json({ error: "A solicitação excede o limite de tamanho." }, 413);
      }
      chunks.push(value);
    }
    const raw = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch { return json({ error: "Corpo JSON inválido." }, 400); }
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.trim().length > MAX_PROMPT) {
    return json({ error: "O prompt deve conter de 1 a 1500 caracteres." }, 400);
  }
  const model = body.model || FLUX_MODEL;
  if (![FLUX_MODEL, QWYTHOS_MODEL, COSMOS_MODEL, QWEN_MODEL].includes(model)) return json({ error: "Modelo não suportado." }, 400);
  const isImageModel = model === FLUX_MODEL || model === QWYTHOS_MODEL;
  const isCosmos = model === COSMOS_MODEL;
  const isQwen = model === QWEN_MODEL;
  const width = Number(body.width ?? 768), height = Number(body.height ?? 768), steps = Number(body.steps ?? 20);
  if (isImageModel && (![[768,768],[1024,768],[768,1024]].some(([w,h]) => w === width && h === height) || ![20,28].includes(steps))) {
    return json({ error: "Dimensões ou passos de inferência inválidos." }, 400);
  }
  if ((isCosmos || isQwen) && (typeof env.HF_SPACE_API_SECRET !== "string" || env.HF_SPACE_API_SECRET.trim().length < 32)) {
    return json({ error: "Os modelos experimentais exigem HF_SPACE_API_SECRET como segredo no Worker e no Hugging Face Space." }, 503);
  }
  if (model === QWYTHOS_MODEL && (typeof body.referenceImage !== "string" || body.referenceImage.length > 4_200_000)) {
    return json({ error: "Envie uma imagem de referência válida de até 3 MiB." }, 400);
  }
  let reservation;
  try {
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
    if (!projectId) throw new Error("firebase-project-missing");
    const user = await firebaseUser(match[1], projectId);
    reservation = await reserveQuota(env, user);
    if (!reservation.allowed) return json({ error: "Você atingiu o limite de 5 gerações por hora.", limit: ACCOUNT_LIMIT, remaining: 0, resetAt: reservation.resetAt }, 429);
    if (isCosmos) {
      const videoData = await hfCall(env, "generate_video", [body.prompt.trim(), env.HF_SPACE_API_SECRET]);
      const videoUrl = getOutputUrl(videoData, "video");
      return json({ type: "video", videoUrl, limit: ACCOUNT_LIMIT, remaining: reservation.remaining, tier: "account" });
    }
    if (isQwen) {
      const textData = await hfCall(env, "generate_text", [body.prompt.trim(), body.language === "en" ? "en" : "pt-BR", env.HF_SPACE_API_SECRET]);
      const first = textData?.[0];
      const answer = typeof first === "string" ? first : first?.text || first?.value || first?.content || "";
      if (typeof answer !== "string" || !answer.trim()) throw new Error("hf-qwen-empty");
      return json({ type: "text", text: answer.trim().slice(0, 12000), limit: ACCOUNT_LIMIT, remaining: reservation.remaining, tier: "account" });
    }
    let imageData;
    if (model === QWYTHOS_MODEL) {
      const reference = await uploadReferenceImage(env, body.referenceImage);
      const interpreted = await hfCall(env, "generate_image_from_image", [body.prompt.trim(), reference, body.language === "en" ? "en" : "pt-BR"]);
      const prompt = interpreted?.[0];
      if (typeof prompt !== "string" || !prompt.trim()) throw new Error("hf-qwythos-empty");
      imageData = await hfCall(env, "generate_image", [prompt.trim().slice(0, MAX_PROMPT), width, height, steps]);
    } else {
      imageData = await hfCall(env, "generate_image", [body.prompt.trim(), width, height, steps]);
    }
    const imageUrl = getOutputUrl(imageData);
    return json({ imageUrl, limit: ACCOUNT_LIMIT, remaining: reservation.remaining, tier: "account" });
  } catch (error) {
    const message = String(error?.message || error);
    console.error("[image-generation]", message);
    if (message.includes("invalid-token")) return json({ error: "Sua sessão é inválida ou expirou. Entre novamente." }, 401);
    if (message.includes("unsupported-provider")) return json({ error: "Use Google, GitHub ou e-mail verificado." }, 403);
    if (message.includes("email-not-verified")) return json({ error: "Verifique seu e-mail antes de gerar imagens." }, 403);
    if (message.includes("firestore") || message.includes("firebase-")) return json({ error: "Não foi possível validar a conta ou reservar a cota. Verifique as credenciais e permissões do Firebase/Firestore." }, 503);
    if (message === "hf-space-id-missing") return json({
      error: "A variável HF_SPACE_ID não está configurada no ambiente de execução deste Worker. Defina HF_SPACE_ID=ErikrafT/erikraft-ai em Runtime → Production e publique uma nova versão.",
      code: "hf-space-id-missing"
    }, 503);
    if (message === "invalid-space-id") return json({
      error: "A variável HF_SPACE_ID está configurada, mas não aponta para o Space esperado (ErikrafT/erikraft-ai).",
      code: "invalid-space-id"
    }, 503);
    if (message.startsWith("hf-upload-") || message.startsWith("hf-start-") || message.startsWith("hf-result-") || message.startsWith("hf-empty") || message.startsWith("hf-qwythos") || message === "hf-inference-failed" || message === "hf-qwen-empty" || message === "hf-invalid-output" || message === "hf-missing-event-id") {
      const stage = message.startsWith("hf-start-") ? "request-start" :
        message.startsWith("hf-result-") ? "result-stream" :
        message.startsWith("hf-upload-") ? "upload" :
        message === "hf-inference-failed" ? "inference" : "response-parse";
      return json({
        error: "O Hugging Face Space falhou ao processar a solicitação. Consulte os logs do Worker e do Space para identificar a etapa.",
        code: "huggingface-request-failed",
        stage
      }, 503);
    }
    if (message.includes("invalid-reference-image")) return json({ error: "Imagem de referência inválida. Use PNG, JPEG ou WebP de até 3 MiB." }, 400);
    return json({ error: "A geração falhou na integração com o Space. Consulte os logs do Worker para identificar a causa." }, 502);
  }
}

const PUBLIC_ROOT_FILES = new Set(["/", "/index.html", "/privacy.html", "/terms.html", "/favicon.ico", "/favicon2.ico", "/robots.txt", "/sitemap.xml", "/llms.txt"]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405, { Allow: "GET" });
      let firebaseJsonValid = false;
      let firebaseProjectMatches = false;
      try {
        const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "");
        firebaseJsonValid = Boolean(serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key);
        firebaseProjectMatches = serviceAccount?.project_id === "erikraft-account";
      } catch {}
      return json({
        ok: firebaseJsonValid && firebaseProjectMatches &&
          typeof env.HF_SPACE_ID === "string" &&
          env.HF_SPACE_ID.trim().toLowerCase() === "erikraft/erikraft-ai",
        firebaseServiceAccountConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON),
        firebaseServiceAccountJsonValid: firebaseJsonValid,
        firebaseProjectMatches: firebaseProjectMatches,
        hfSpaceConfigured: typeof env.HF_SPACE_ID === "string" && env.HF_SPACE_ID.trim().length > 0,
        hfSpaceIdValid: typeof env.HF_SPACE_ID === "string" && env.HF_SPACE_ID.trim().toLowerCase() === "erikraft/erikraft-ai",
        experimentalSecretConfigured: typeof env.HF_SPACE_API_SECRET === "string" && env.HF_SPACE_API_SECRET.trim().length >= 32
      });
    }
    if (url.pathname === "/api/models") {
      if (request.method !== "GET") return json({ error: "Método não permitido. Use GET." }, 405, { Allow: "GET" });
      const configuredSpace = typeof env.HF_SPACE_ID === "string" &&
        env.HF_SPACE_ID.trim().toLowerCase() === "erikraft/erikraft-ai";
      const configuredSecret = typeof env.HF_SPACE_API_SECRET === "string" && env.HF_SPACE_API_SECRET.trim().length >= 32;
      const experimentalConfigured = configuredSpace && configuredSecret;
      return json({
        models: {
          [COSMOS_MODEL]: experimentalConfigured,
          [QWEN_MODEL]: experimentalConfigured
        },
        selectableModels: [FLUX_MODEL, QWYTHOS_MODEL, COSMOS_MODEL, QWEN_MODEL],
        runtimeChecksRequired: true
      });
    }
    if (url.pathname === "/api/generate") {
      if (request.method !== "POST") return json({ error: "Método não permitido. Use POST." }, 405, { Allow: "POST" });
      return generate(request, env);
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.") ||
        url.pathname.startsWith("/cloudflare/") || url.pathname.startsWith("/huggingface/") ||
        url.pathname.startsWith("/.github/") || url.pathname === "/wrangler.jsonc" ||
        url.pathname === "/package.json" || url.pathname === "/package-lock.json" ||
        url.pathname === "/README.md" || url.pathname === "/LICENSE" ||
        url.pathname === "/CONTRIBUTING.md") {
      return new Response("Not found", { status: 404, headers: NO_STORE });
    }
    const allowed = PUBLIC_ROOT_FILES.has(url.pathname) ||
      url.pathname.startsWith("/assets/") ||
      url.pathname === "/assets";
    if (!allowed) return new Response("Not found", { status: 404, headers: NO_STORE });
    return env.ASSETS.fetch(request);
  }
};

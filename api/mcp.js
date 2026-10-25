import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const SITE_ORIGIN = "https://ai.erikraft.com";
const UI_URI = "ui://erikraft-ai/studio-v1.html";

const MODEL_CATALOG = [
  { id: "aoxo/flux.1dev-abliterated", type: "image", label: "FLUX.1 Dev", description: "Text-to-image generation" },
  { id: "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated", type: "image-edit", label: "Qwythos 9B", description: "Image editing with a reference image" },
  { id: "DuoNeural/Cosmos3-Nano-Abliterated", type: "video", label: "Cosmos 3 Nano", description: "Experimental video generation" },
  { id: "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF", type: "text", label: "Qwen3.8 27B", description: "Experimental text generation" },
  { id: "AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF", type: "image", label: "Qwen Image 2.1 Turbo", description: "Experimental text-to-image generation" },
  { id: "tonyassi/voice-clone", type: "audio", label: "Multilingual Voice Clone", description: "Voice generation from a WAV reference" }
];

const STUDIO_HTML = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;--accent:#867d6c;--line:color-mix(in srgb,currentColor 14%,transparent);--panel:color-mix(in srgb,currentColor 4%,transparent)}
*{box-sizing:border-box}body{margin:0;padding:18px;font:14px/1.5 system-ui,-apple-system,sans-serif;color:var(--color,inherit);background:transparent}
main{max-width:760px;margin:auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}.mark{width:42px;height:42px;border-radius:14px;background:var(--accent);display:grid;place-items:center;color:white;font-size:20px;font-weight:700}.muted{opacity:.68}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase}.brand h1{font-size:19px;line-height:1.2;margin:2px 0}.panel{border:1px solid var(--line);border-radius:16px;padding:16px;margin:12px 0;background:var(--panel)}label{display:block;font-weight:600;margin:12px 0 6px}input,select,textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:10px;width:100%;padding:10px}textarea{min-height:110px;resize:vertical}input[type=file]{font-size:12px}button{font:inherit;border:1px solid var(--line);border-radius:10px;padding:10px 14px;cursor:pointer;background:transparent;color:inherit}button.primary{background:var(--accent);color:white;border-color:transparent;font-weight:650}button:disabled{opacity:.5;cursor:wait}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.status{font-size:12px;padding:6px 9px;border:1px solid var(--line);border-radius:99px;display:inline-block}.result{overflow-wrap:anywhere}.result img,.result video,.result audio{max-width:100%;width:100%;border-radius:10px;margin-top:10px}.result a{color:inherit}.small{font-size:12px}.warn{border-left:3px solid var(--accent);padding-left:10px}.hidden{display:none}@media(max-width:520px){body{padding:12px}.grid{grid-template-columns:1fr}.panel{padding:12px}}
</style></head>
<body><main>
<header class="brand"><div class="mark">E</div><div><div class="eyebrow muted">ErikrafT AI™ · ChatGPT App</div><h1>AI Studio</h1><div class="muted small">Generate, explore models, and manage your account tools.</div></div></header>
<section class="panel"><div class="grid"><div><span class="eyebrow muted">Backend</span><div id="health" class="status">Checking…</div></div><div><span class="eyebrow muted">Models</span><div id="models-status" class="status">Loading…</div></div></div><div class="actions"><button id="refresh">Refresh status</button><a href="https://ai.erikraft.com/" target="_blank" rel="noreferrer"><button type="button">Open ErikrafT AI™</button></a></div></section>
<section class="panel"><div class="eyebrow muted">Create</div><label for="model">Model</label><select id="model">
<option value="aoxo/flux.1dev-abliterated">FLUX.1 Dev · Image</option>
<option value="fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated">Qwythos 9B · Image editing</option>
<option value="DuoNeural/Cosmos3-Nano-Abliterated">Cosmos 3 Nano · Video (experimental)</option>
<option value="0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF">Qwen3.8 27B · Text (experimental)</option>
<option value="AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF">Qwen Image 2.1 Turbo · Image (experimental)</option>
<option value="tonyassi/voice-clone">Multilingual Voice Clone · Audio</option>
</select>
<label for="prompt">Prompt</label><textarea id="prompt" maxlength="1500" placeholder="Describe what you want to create…"></textarea>
<div id="image-options" class="grid"><div><label for="size">Image size</label><select id="size"><option value="768x768">768 × 768</option><option value="1024x768">1024 × 768</option><option value="768x1024">768 × 1024</option></select></div><div><label for="steps">Steps</label><select id="steps"><option value="20">20</option><option value="28">28</option></select></div></div>
<div id="reference-wrap" class="hidden"><label for="reference">Reference image (Qwythos)</label><input id="reference" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted small">PNG, JPEG or WebP, up to 3 MiB.</p></div>
<div id="audio-wrap" class="hidden"><label for="audio">Voice reference (WAV)</label><input id="audio" type="file" accept="audio/wav,audio/x-wav"><p class="muted small">WAV reference audio, 10–60 seconds, up to 3 MiB.</p></div>
<p class="muted small warn">Sign in securely through the ChatGPT connection dialog. The plugin uses a short-lived OAuth token; do not paste passwords or tokens into this interface.</p>
<div class="actions"><button class="primary" id="generate">Generate</button><button id="clear">Clear</button><span id="run-status" class="status">Ready</span></div>
<div id="result" class="result"></div></section>
<section class="panel" id="profile-panel"><div class="eyebrow muted">Account</div><h2 style="font-size:16px;margin:6px 0">Profile photo</h2><p class="muted small">Use the same short-lived Firebase session token above. Changes use the existing account-owned profile API.</p><label for="profile-photo">Custom profile photo</label><input id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted small">PNG, JPEG or WebP, maximum 1 MiB.</p><div id="profile-preview" class="small muted">No preview loaded.</div><div class="actions"><button id="profile-load">Check saved photo</button><button id="profile-save">Save selected photo</button><button id="profile-delete">Remove photo</button><button id="profile-restore">Restore provider photo</button><span id="profile-status" class="status">Ready</span></div></section>
<footer class="muted small">Models run on the existing ErikrafT AI™ / Hugging Face backend. Experimental models may be unavailable because of queue, hardware, or provider limits. Account quotas still apply.</footer>
</main>
<script>
const $=id=>document.getElementById(id);
const model=$("model");
function updateFields(){const m=model.value;const textOnly=m.includes("0bserverx/Qwen3.8");$("reference-wrap").classList.toggle("hidden",!m.includes("Qwythos"));$("audio-wrap").classList.toggle("hidden",!m.includes("voice-clone"));$("image-options").classList.toggle("hidden",m.includes("Cosmos")||textOnly||m.includes("voice-clone"));}
model.addEventListener("change",updateFields);updateFields();
function pretty(v){return JSON.stringify(v,null,2)}
function unpackToolResult(raw){const value=raw?.result&&!raw?.structuredContent?raw.result:raw;if(raw?.isError||value?.isError)throw new Error(value?.content?.[0]?.text||raw?.content?.[0]?.text||"The tool request failed.");return value?.structuredContent??value?.result??value;}
async function callTool(name,args={}){if(window.openai&&typeof window.openai.callTool==="function")return await window.openai.callTool(name,args);throw new Error("This ChatGPT host does not expose the app tool bridge.");}
async function refresh(){
  $("health").textContent="Checking…";$("models-status").textContent="Loading…";
  try {
    const hm=unpackToolResult(await callTool("erikraft_ai_status",{}));
    $("health").textContent=hm.ok===false?"Needs configuration":"Responding";$("health").title=pretty(hm);
    const mm=unpackToolResult(await callTool("erikraft_ai_list_models",{}));const flags=mm.models||{};
    for(const option of model.options){option.disabled=Object.prototype.hasOwnProperty.call(flags,option.value)&&flags[option.value]===false;}
    $("models-status").textContent=[...model.options].filter(option=>!option.disabled).length+" enabled / "+model.options.length+" models";
    if(model.selectedOptions[0]?.disabled){const first=[...model.options].find(option=>!option.disabled);if(first)model.value=first.value;updateFields();}
  } catch(e){$("health").textContent="Unavailable";$("models-status").textContent="Try again";}
}
function fileData(file,maxBytes=3*1024*1024){return new Promise((resolve,reject)=>{if(!file)return resolve(null);if(file.size>maxBytes)return reject(new Error("The selected file exceeds the size limit."));const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Could not read the selected file."));r.readAsDataURL(file);});}
$("refresh").addEventListener("click",refresh);
$("clear").addEventListener("click",()=>{$("prompt").value="";$("reference").value="";$("audio").value="";$("result").replaceChildren();$("run-status").textContent="Ready";});
$("generate").addEventListener("click",async()=>{const prompt=$("prompt").value.trim();if(!prompt){$("run-status").textContent="Enter a prompt";return;}const b=$("generate");b.disabled=true;$("run-status").textContent="Working…";$("result").replaceChildren();try{const size=$("size").value.split("x").map(Number);const args={prompt,model:model.value,width:size[0],height:size[1],steps:Number($("steps").value)};if(model.value.includes("Qwythos"))args.referenceImage=await fileData($("reference").files[0]);if(model.value.includes("voice-clone"))args.voiceAudio=await fileData($("audio").files[0]);const raw=await callTool("erikraft_ai_generate",args);const data=unpackToolResult(raw);const out=document.createElement("div");out.className="panel";if(data.imageUrl){const img=document.createElement("img");img.src=data.imageUrl;img.alt="Generated image";out.appendChild(img);const a=document.createElement("a");a.href=data.imageUrl;a.target="_blank";a.rel="noreferrer";a.textContent="Open image";out.appendChild(a);}else if(data.videoUrl){const v=document.createElement("video");v.controls=true;v.src=data.videoUrl;out.appendChild(v);const a=document.createElement("a");a.href=data.videoUrl;a.target="_blank";a.rel="noreferrer";a.textContent="Open video";out.appendChild(a);}else if(data.audioUrl){const a=document.createElement("audio");a.controls=true;a.src=data.audioUrl;out.appendChild(a);const link=document.createElement("a");link.href=data.audioUrl;link.target="_blank";link.rel="noreferrer";link.textContent="Open audio";out.appendChild(link);}else if(data.text){const p=document.createElement("pre");p.style.whiteSpace="pre-wrap";p.textContent=data.text;out.appendChild(p);}else{const pre=document.createElement("pre");pre.style.whiteSpace="pre-wrap";pre.textContent=pretty(data);out.appendChild(pre);}const quota=document.createElement("p");quota.className="muted small";if(data.remaining!==undefined)quota.textContent="Remaining this hour: "+data.remaining;out.appendChild(quota);$("result").appendChild(out);$("run-status").textContent="Completed";}catch(e){$("run-status").textContent="Request failed";const p=document.createElement("p");p.className="warn";p.textContent=String(e.message||e);$("result").appendChild(p);}finally{b.disabled=false;}});
function showProfileState(text,photo){const root=$("profile-preview");root.replaceChildren();if(photo){const img=document.createElement("img");img.src=photo;img.alt="Profile photo";img.style.width="96px";img.style.height="96px";img.style.objectFit="cover";img.style.borderRadius="50%";root.appendChild(img);}else{const p=document.createElement("p");p.className="muted small";p.textContent=text;root.appendChild(p);}}
async function profileCall(tool,args={}){const data=unpackToolResult(await callTool(tool,args));if(data?.error)throw new Error(data.error);return data;}
$("profile-load").addEventListener("click",async()=>{const s=$("profile-status");s.textContent="Checking…";try{const d=await profileCall("erikraft_ai_get_profile_photo");showProfileState(d.photoDisabled?"Profile photo removed.":d.hasCustomPhoto?"A custom profile photo is saved.":d.hasProviderPhoto?"A provider photo is available.":"No profile photo is configured.");s.textContent="Loaded";}catch(e){showProfileState(String(e.message||e));s.textContent="Failed";}});
$("profile-save").addEventListener("click",async()=>{const s=$("profile-status");s.textContent="Saving…";try{const file=$("profile-photo").files[0];if(!file)throw new Error("Choose a profile photo first.");if(!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error("Choose a PNG, JPEG, or WebP image.");const photo=await fileData(file,1024*1024);const d=await profileCall("erikraft_ai_save_profile_photo",{photo});showProfileState("Custom profile photo saved.",photo);s.textContent=d.saved?"Saved":"Completed";}catch(e){showProfileState(String(e.message||e));s.textContent="Failed";}});
$("profile-delete").addEventListener("click",async()=>{const s=$("profile-status");s.textContent="Removing…";try{await profileCall("erikraft_ai_delete_profile_photo");showProfileState("Profile photo removed; this preference is saved to your account.");s.textContent="Removed";}catch(e){showProfileState(String(e.message||e));s.textContent="Failed";}});
$("profile-restore").addEventListener("click",async()=>{const s=$("profile-status");s.textContent="Restoring…";try{const d=await profileCall("erikraft_ai_restore_provider_photo");showProfileState(d.providerPhotoAvailable?"Provider profile photo restored.":"No provider photo is available.");s.textContent="Restored";}catch(e){showProfileState(String(e.message||e));s.textContent="Failed";}});
refresh();
</script></body></html>`;

function jsonRpc(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function toolText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value
  };
}
function modelCatalogWithAvailability(modelsResponse = {}) {
  const configured = modelsResponse.models || {};
  return MODEL_CATALOG.map((model) => ({ ...model, enabled: configured[model.id] !== false }));
}
async function siteRequest(path, { token, method = "GET", body } = {}) {
  const headers = { accept: "application/json", "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const response = await fetch(SITE_ORIGIN + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(260000)
  });
  let data;
  try { data = await response.json(); }
  catch { data = { error: "ErikrafT AI™ returned a non-JSON response." }; }
  if (!response.ok) {
    const error = new Error(String(data.error || "ErikrafT AI™ request failed (HTTP " + response.status + ").").slice(0, 800));
    error.status = response.status;
    throw error;
  }
  return data;
}
function validateToken(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 10000) {
    throw new Error("A valid short-lived Firebase ID token is required. Sign in to ErikrafT AI™ first.");
  }
}
async function callTool(name, args, bearerToken) {
  if (name === "erikraft_ai_studio") {
    const [health, models] = await Promise.all([
      siteRequest("/api/health"),
      siteRequest("/api/models")
    ]);
    return toolText({ health, ...models, modelCatalog: modelCatalogWithAvailability(models) });
  }
  if (name === "erikraft_ai_status") return toolText(await siteRequest("/api/health"));
  if (name === "erikraft_ai_list_models") {
    const [models, health] = await Promise.all([siteRequest("/api/models"), siteRequest("/api/health")]);
    return toolText({ ...models, health, modelCatalog: modelCatalogWithAvailability(models) });
  }
  const token = bearerToken || args.firebaseIdToken;
  validateToken(token);
  if (name === "erikraft_ai_generate") {
    const { firebaseIdToken, ...body } = args;
    if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 1500) throw new Error("Prompt must contain 1–1500 characters.");
    const supported = MODEL_CATALOG.some((m) => m.id === (body.model || MODEL_CATALOG[0].id));
    if (!supported) throw new Error("Unsupported model.");
    return toolText(await siteRequest("/api/generate", { token, method: "POST", body }));
  }
  if (name === "erikraft_ai_get_profile_photo") {
    const data = await siteRequest("/api/profile", { token });
    return toolText({ photoDisabled: data.photoDisabled === true, hasCustomPhoto: typeof data.photo === "string" && data.photo.startsWith("data:"), hasProviderPhoto: typeof data.photo === "string" && /^https:\/\//i.test(data.photo) });
  }
  if (name === "erikraft_ai_save_profile_photo") {
    if (typeof args.photo !== "string" || args.photo.length > 1400000) throw new Error("Profile photos must be a PNG, JPEG, or WebP data URL no larger than 1 MiB.");
    const data = await siteRequest("/api/profile", { token, method: "PUT", body: { photo: args.photo } });
    return toolText({ saved: data.saved === true });
  }
  if (name === "erikraft_ai_delete_profile_photo") {
    const data = await siteRequest("/api/profile", { token, method: "DELETE" });
    return toolText({ deleted: data.deleted === true, photoDisabled: data.photoDisabled === true });
  }
  if (name === "erikraft_ai_restore_provider_photo") {
    const data = await siteRequest("/api/profile", { token, method: "PUT", body: { restoreProviderPhoto: true } });
    return toolText({ restored: data.restored === true, providerPhotoAvailable: typeof data.photo === "string" && /^https:\/\//i.test(data.photo) });
  }
  throw new Error("Unknown tool: " + name);
}

const tools = [
  {
    name: "erikraft_ai_studio",
    title: "Open ErikrafT AI Studio",
    description: "Open the interactive ErikrafT AI™ studio in ChatGPT. Shows backend status, available model catalog, and a visual interface for image, video, text, and voice generation. Generation requires an authenticated Firebase ID token.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    _meta: { ui: { resourceUri: UI_URI }, "openai/outputTemplate": UI_URI, "openai/widgetAccessible": true, "openai/ui": { entrypoints: [{ type: "thread" }] } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  },
  {
    name: "erikraft_ai_status",
    title: "ErikrafT AI backend status",
    description: "Check backend configuration flags. This does not prove that model inference or the MongoDB connection is operational.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    _meta: { "openai/widgetAccessible": true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  },
  {
    name: "erikraft_ai_list_models",
    title: "List ErikrafT AI models",
    description: "List models exposed by ErikrafT AI™ and their configuration flags. Experimental model availability requires live inference tests.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    _meta: { "openai/widgetAccessible": true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  },
  {
    name: "erikraft_ai_generate",
    title: "Generate with ErikrafT AI",
    description: "Generate an image, video, text, or voice using the same authenticated API as the ErikrafT AI™ website. Requires the user's authenticated OAuth connection; the bearer token is supplied by the MCP host and is never a tool argument. Never provide passwords, service-account credentials, Hugging Face tokens, or MongoDB connection strings. Respects server-side account quotas.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 1500 },
        model: { type: "string", enum: MODEL_CATALOG.map((m) => m.id) },
        width: { type: "integer", enum: [768, 1024] },
        height: { type: "integer", enum: [768, 1024] },
        steps: { type: "integer", enum: [20, 28] },
        referenceImage: { type: "string", maxLength: 4200000, description: "Qwythos reference image data URL (PNG/JPEG/WebP, max 3 MiB decoded)." },
        voiceAudio: { type: "string", maxLength: 4200000, description: "Voice reference WAV data URL (at least 10 seconds; max 3 MiB decoded)." }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    _meta: { ui: { resourceUri: UI_URI, visibility: ["app"] }, "openai/outputTemplate": UI_URI, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false }
  },
  {
    name: "erikraft_ai_get_profile_photo",
    title: "Get profile photo",
    description: "Read the signed-in user's profile photo through the existing MongoDB Atlas-backed profile API. Requires an authenticated OAuth connection.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  },
  {
    name: "erikraft_ai_save_profile_photo",
    title: "Save custom profile photo",
    description: "Save a PNG/JPEG/WebP profile image (data URL, max 1 MiB) for the signed-in user through the existing profile API. Requires an authenticated OAuth connection.",
    inputSchema: { type: "object", properties: { photo: { type: "string", minLength: 30, maxLength: 1400000, description: "PNG/JPEG/WebP data URL, maximum 1 MiB decoded." } }, required: ["photo"], additionalProperties: false },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false }
  },
  {
    name: "erikraft_ai_delete_profile_photo",
    title: "Delete profile photo",
    description: "Persist the signed-in user's choice to remove their profile photo using the existing profile API. Requires an authenticated OAuth connection.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true }
  },
  {
    name: "erikraft_ai_restore_provider_photo",
    title: "Restore provider photo",
    description: "Restore the photo from the signed-in user's identity provider through the existing profile API. Requires an authenticated OAuth connection.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    _meta: { ui: { visibility: ["app"] }, "openai/widgetAccessible": true },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  }
];

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "https://chatgpt.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id, mcp-protocol-version");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const authHeader = String(req.headers.authorization || "");
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    res.setHeader("WWW-Authenticate", 'Bearer resource_metadata="https://ai.erikraft.com/.well-known/oauth-protected-resource"');
    return res.status(401).json({ error: "Authentication required." });
  }
  const accessToken = bearerMatch[1];
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!getApps().length) {
      if (!raw) throw new Error("Firebase Admin is not configured");
      initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    await getAuth().verifyIdToken(accessToken, true);
  } catch {
    res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token", resource_metadata="https://ai.erikraft.com/.well-known/oauth-protected-resource"');
    return res.status(401).json({ error: "Invalid or expired OAuth access token." });
  }
  const message = req.body;
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC request."));
  }
  const id = message.id;
  try {
    let result;
    if (message.method === "initialize") {
      result = {
        protocolVersion: ["2025-11-25", "2025-06-18", "2025-03-26"].includes(message.params?.protocolVersion) ? message.params.protocolVersion : "2025-11-25",
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: "erikraft-ai", version: "0.4.0" },
        instructions: "ErikrafT AI™ MCP server. OAuth 2.0 Authorization Code with PKCE (S256) is required. The user signs in through Firebase Authentication; the OAuth access token is a short-lived Firebase ID token. Never ask users to paste tokens or passwords into chat. Never request Firebase service-account JSON, Hugging Face tokens/secrets, or MongoDB credentials."
      };
    } else if (message.method === "ping") {
      result = {};
    } else if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
      return res.status(202).end();
    } else if (message.method === "tools/list") {
      result = { tools };
    } else if (message.method === "resources/list") {
      result = { resources: [{ uri: UI_URI, name: "ErikrafT AI Studio", description: "Interactive generation studio", mimeType: "text/html;profile=mcp-app" }] };
    } else if (message.method === "resources/read") {
      if (message.params?.uri !== UI_URI) return res.status(200).json(rpcError(id, -32602, "Unknown resource URI."));
      result = { contents: [{
        uri: UI_URI,
        mimeType: "text/html;profile=mcp-app",
        text: STUDIO_HTML,
        _meta: { ui: { prefersBorder: true, domain: "https://ai.erikraft.com", csp: { connectDomains: ["https://ai.erikraft.com"], resourceDomains: ["https://ai.erikraft.com", "https://huggingface.co", "https://*.hf.space", "https://*.huggingface.co"] } } }
      }] };
    } else if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments || {};
      try {
        return res.status(200).json(jsonRpc(id ?? null, await callTool(name, args, accessToken)));
      } catch (error) {
        return res.status(200).json(jsonRpc(id ?? null, {
          isError: true,
          content: [{ type: "text", text: String(error?.message || error).slice(0, 800) }]
        }));
      }
    } else {
      return res.status(200).json(rpcError(id, -32601, "Method not found: " + message.method));
    }
    if (id === undefined) return res.status(202).end();
    return res.status(200).json(jsonRpc(id, result));
  } catch (error) {
    return res.status(200).json(rpcError(id, -32603, String(error?.message || error).slice(0, 500)));
  }
}
const SITE_ORIGIN = "https://ai.erikraft.com";
const MCP_VERSION = "2025-03-26";
const MODELS = [
  { id: "aoxo/flux.1dev-abliterated", kind: "image", description: "Text-to-image generation" },
  { id: "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated", kind: "image-edit", description: "Image editing from a reference image and instructions" },
  { id: "DuoNeural/Cosmos3-Nano-Abliterated", kind: "video", description: "Experimental video generation; availability depends on Space resources" },
  { id: "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF", kind: "text", description: "Experimental text generation; availability depends on Space resources" },
  { id: "tonyassi/voice-clone", kind: "audio", description: "Multilingual voice cloning from a WAV reference" }
];

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function textResult(value, structuredContent) {
  const result = { content: [{ type: "text", text: JSON.stringify(value) }] };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  return result;
}
function bearer(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Accept-Language": "en" };
}
async function callSite(path, token, method = "GET", body) {
  const headers = token ? bearer(token) : { "Content-Type": "application/json" };
  const response = await fetch(`${SITE_ORIGIN}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store"
  });
  let data;
  try { data = await response.json(); } catch { data = { error: "The ErikrafT AI service returned a non-JSON response." }; }
  if (!response.ok) {
    const err = new Error(data.error || `ErikrafT AI API returned HTTP ${response.status}.`);
    err.status = response.status;
    throw err;
  }
  return data;
}
const tools = [
  {
    name: "erikraft_ai_status",
    description: "Check the public ErikrafT AI™ backend health. This is a configuration/health check, not proof that every model can complete inference.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "erikraft_ai_list_models",
    description: "List models currently exposed by ErikrafT AI™ and the backend's model-configuration flags.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "erikraft_ai_generate",
    description: "Generate text, an image, a video, or speech using the same authenticated generation API as the ErikrafT AI™ website. Requires a valid Firebase ID token from a signed-in ErikrafT AI™ session. Never provide a password, service-account key, HF token, or MongoDB URI.",
    inputSchema: {
      type: "object",
      properties: {
        firebaseIdToken: { type: "string", description: "Short-lived Firebase ID token for the currently signed-in ErikrafT AI™ user. Treat as a secret." },
        prompt: { type: "string", minLength: 1, maxLength: 1500, description: "Prompt or text to generate." },
        model: { type: "string", enum: MODELS.map((model) => model.id), description: "Model ID. Defaults to FLUX image generation." },
        width: { type: "integer", enum: [768, 1024], description: "Image width; supported image sizes are 768x768, 1024x768, and 768x1024." },
        height: { type: "integer", enum: [768, 1024], description: "Image height; supported image sizes are 768x768, 1024x768, and 768x1024." },
        steps: { type: "integer", enum: [20, 28], description: "Image inference steps." },
        referenceImage: { type: "string", description: "For Qwythos only: a data URL containing a PNG, JPEG, or WebP reference image, up to 3 MiB decoded." },
        voiceAudio: { type: "string", description: "For voice cloning only: a WAV data URL with 10–60 seconds of reference speech, within the site's payload limit." }
      },
      required: ["firebaseIdToken", "prompt"],
      additionalProperties: false
    }
  },
  {
    name: "erikraft_ai_get_profile_photo",
    description: "Read the signed-in user's profile photo through ErikrafT AI™'s profile API backed by MongoDB Atlas. Requires a Firebase ID token.",
    inputSchema: {
      type: "object",
      properties: { firebaseIdToken: { type: "string", description: "Short-lived Firebase ID token. Treat as a secret." } },
      required: ["firebaseIdToken"],
      additionalProperties: false
    }
  },
  {
    name: "erikraft_ai_save_profile_photo",
    description: "Save a custom profile photo to the signed-in user's MongoDB Atlas profile record. Requires a PNG/JPEG/WebP data URL of at most 1 MiB and a Firebase ID token.",
    inputSchema: {
      type: "object",
      properties: {
        firebaseIdToken: { type: "string", description: "Short-lived Firebase ID token. Treat as a secret." },
        photo: { type: "string", description: "PNG, JPEG, or WebP image data URL; maximum decoded size 1 MiB." }
      },
      required: ["firebaseIdToken", "photo"],
      additionalProperties: false
    }
  },
  {
    name: "erikraft_ai_delete_profile_photo",
    description: "Disable the signed-in user's profile photo and persist that choice in MongoDB Atlas so provider fallback does not restore it. Requires a Firebase ID token.",
    inputSchema: {
      type: "object",
      properties: { firebaseIdToken: { type: "string", description: "Short-lived Firebase ID token. Treat as a secret." } },
      required: ["firebaseIdToken"],
      additionalProperties: false
    }
  },
  {
    name: "erikraft_ai_restore_provider_photo",
    description: "Restore the profile photo from the user's linked identity provider and clear the custom photo record in MongoDB Atlas. Requires a Firebase ID token.",
    inputSchema: {
      type: "object",
      properties: { firebaseIdToken: { type: "string", description: "Short-lived Firebase ID token. Treat as a secret." } },
      required: ["firebaseIdToken"],
      additionalProperties: false
    }
  }
];

async function invokeTool(name, args) {
  if (name === "erikraft_ai_status") {
    return textResult(await callSite("/api/health"));
  }
  if (name === "erikraft_ai_list_models") {
    const [models, health] = await Promise.all([
      callSite("/api/models"),
      callSite("/api/health").catch((error) => ({ healthError: error.message }))
    ]);
    return textResult({ ...models, health, modelCatalog: MODELS });
  }
  const token = args.firebaseIdToken;
  if (typeof token !== "string" || token.length < 20 || token.length > 10000) {
    throw new Error("A valid Firebase ID token is required. Sign in to ErikrafT AI™ first; never send passwords or backend secrets.");
  }
  if (name === "erikraft_ai_generate") {
    const { firebaseIdToken, ...body } = args;
    return textResult(await callSite("/api/generate", token, "POST", body));
  }
  if (name === "erikraft_ai_get_profile_photo") {
    return textResult(await callSite("/api/profile", token, "GET"));
  }
  if (name === "erikraft_ai_save_profile_photo") {
    return textResult(await callSite("/api/profile", token, "PUT", { photo: args.photo }));
  }
  if (name === "erikraft_ai_delete_profile_photo") {
    return textResult(await callSite("/api/profile", token, "DELETE"));
  }
  if (name === "erikraft_ai_restore_provider_photo") {
    return textResult(await callSite("/api/profile", token, "PUT", { restoreProviderPhoto: true }));
  }
  throw new Error(`Unknown tool: ${name}`);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "https://chatgpt.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id, mcp-protocol-version");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const message = req.body;
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
    return res.status(400).json(errorResponse(null, -32600, "Invalid JSON-RPC request."));
  }
  const { id, method, params = {} } = message;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return res.status(202).end();
  try {
    let result;
    if (method === "initialize") {
      result = {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "erikraft-ai", version: "0.1.0" },
        instructions: "Use public status/model tools without credentials. Generation and profile-photo tools require the caller's short-lived Firebase ID token. Do not request or store passwords, HF tokens, service-account JSON, or MongoDB credentials."
      };
    } else if (method === "ping") {
      result = {};
    } else if (method === "tools/list") {
      result = { tools };
    } else if (method === "tools/call") {
      if (!params || typeof params.name !== "string" || !params.arguments || typeof params.arguments !== "object") {
        return res.status(200).json(errorResponse(id ?? null, -32602, "Invalid tool call arguments."));
      }
      try {
        return res.status(200).json(response(id ?? null, await invokeTool(params.name, params.arguments)));
      } catch (error) {
        return res.status(200).json(response(id ?? null, {
          isError: true,
          content: [{ type: "text", text: String(error?.message || error).slice(0, 800) }]
        }));
      }
    } else {
      return res.status(200).json(errorResponse(id ?? null, -32601, `Method not found: ${String(method)}`));
    }
    if (id === undefined) return res.status(202).end();
    return res.status(200).json(response(id, result));
  } catch (error) {
    return res.status(200).json(errorResponse(id ?? null, -32603, String(error?.message || error).slice(0, 500)));
  }
}

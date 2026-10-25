const FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated";
const QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated";
const COSMOS_MODEL_ID = "DuoNeural/Cosmos3-Nano-Abliterated";
const QWEN_MODEL_ID = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF";
const QWEN_IMAGE_MODEL_ID = "AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF";
const VOICE_CLONE_MODEL_ID = "tonyassi/voice-clone";

const SPACE_ID = "erikraft/erikraft-ai";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function featureEnabled(value) {
  // Missing values mean "try it" so the real HF runtime can be validated.
  // Set an explicit false/0/no/off in Vercel to disable a mode.
  if (value == null || String(value).trim() === "") return true;
  return ENABLED_VALUES.has(String(value).trim().toLowerCase());
}

function experimentalBackendConfigured() {
  const spaceId = String(process.env.HF_SPACE_ID || "").trim().toLowerCase();
  const secret = String(process.env.HF_SPACE_API_SECRET || "").trim();
  return spaceId === SPACE_ID && secret.length >= 32;
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Do not advertise a model as configured when /api/generate will fail its
  // required HF_SPACE_ID or shared-secret checks.
  const backendConfigured = experimentalBackendConfigured();
  const models = {
    [COSMOS_MODEL_ID]: backendConfigured && featureEnabled(process.env.ENABLE_COSMOS_VIDEO),
    [QWEN_MODEL_ID]: backendConfigured && featureEnabled(process.env.ENABLE_QWEN_TEXT),
    [QWEN_IMAGE_MODEL_ID]: backendConfigured && featureEnabled(process.env.ENABLE_QWEN_IMAGE),
    [VOICE_CLONE_MODEL_ID]: true
  };

  return res.status(200).json({
    models,
    selectableModels: [FLUX_MODEL_ID, QWYTHOS_MODEL_ID, COSMOS_MODEL_ID, QWEN_MODEL_ID, QWEN_IMAGE_MODEL_ID, VOICE_CLONE_MODEL_ID],
    runtimeChecksRequired: true
  });
}

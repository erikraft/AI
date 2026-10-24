import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { Client, handle_file } from "@gradio/client";
import { franc } from "franc-min";
import { parseBuffer } from "music-metadata";

const WINDOW_MS = 60 * 60 * 1000;
// Keep a finite free-tier default; provider limits remain independent.
const DEFAULT_ACCOUNT_MAX_PER_WINDOW = 10;
const MAX_CONFIGURABLE_ACCOUNT_MAX_PER_WINDOW = 20;
function getAccountMaxPerWindow() {
  const configured = Number.parseInt(process.env.GENERATION_MAX_PER_HOUR || "", 10);
  if (!Number.isInteger(configured) || configured < 1 || configured > MAX_CONFIGURABLE_ACCOUNT_MAX_PER_WINDOW) return DEFAULT_ACCOUNT_MAX_PER_WINDOW;
  return configured;
}
const MAX_PROMPT_LENGTH = 1500;
const FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated";
const QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated";
const COSMOS_MODEL_ID = "DuoNeural/Cosmos3-Nano-Abliterated";
const QWEN_MODEL_ID = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF";
const VOICE_CLONE_MODEL_ID = "tonyassi/voice-clone";
const VOICE_LANGUAGE_SPACE_ID = "hf-audio/whisper-large-v3";
const VOICE_CLONE_SPACE_ID = "Nymbo/Voice-Clone-Multilingual";
const VOICE_LANGUAGE_TIMEOUT_MS = 75_000;
const VOICE_CLONE_TIMEOUT_MS = 150_000;
const VOICE_LANGUAGE_CODES = Object.freeze({
  eng: "en", por: "pt", spa: "es", fra: "fr", fre: "fr", deu: "de", ger: "de",
  ita: "it", pol: "pl", tur: "tr", rus: "ru", nld: "nl", dut: "nl", ces: "cs", cze: "cs",
  ara: "ar", cmn: "zh-cn", zho: "zh-cn", jpn: "ja", kor: "ko", hun: "hu"
});
const MAX_VOICE_AUDIO_BYTES = 3 * 1024 * 1024;
const MIN_VOICE_AUDIO_DURATION_SECONDS = 10;
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const envEnabled = (value) => {
  // Allow real inference attempts unless the operator explicitly disables a model.
  if (value == null || String(value).trim() === "") return true;
  return ENABLED_VALUES.has(String(value).trim().toLowerCase());
};

 // Leave headroom before Vercel's 300-second Hobby function ceiling. A timeout
// makes a stalled experimental request return an actionable error instead of
// leaving the browser in an endless "Thinking…" state. It cannot cancel GPU work
// already queued by Gradio, so users are warned not to retry immediately.
const EXPERIMENTAL_INFERENCE_TIMEOUT_MS = 235_000;
const QWEN_INFERENCE_TIMEOUT_MS = 235_000;
const SPACE_CONNECT_TIMEOUT_MS = 30_000;

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          error.name = "InferenceTimeoutError";
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function predictWithTimeout(client, endpoint, args, timeoutMs = EXPERIMENTAL_INFERENCE_TIMEOUT_MS) {
  return withTimeout(
    client.predict(endpoint, args),
    timeoutMs,
    "Experimental inference exceeded its server-side time budget."
  );
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

function requestLanguage(req) {
  const requested = String(req.body?.language || req.headers["accept-language"] || "").toLowerCase();
  return requested === "en" || requested.startsWith("en-") || requested.startsWith("en,") ? "en" : "pt-BR";
}

function localized(req, portuguese, english) {
  return requestLanguage(req) === "en" ? english : portuguese;
}

function detectReferenceLanguage(transcript) {
  if (typeof transcript !== "string" || transcript.trim().length < 12) return null;
  const code = franc(transcript.trim());
  return VOICE_LANGUAGE_CODES[code] || null;
}

function detectVoicePromptLanguage(prompt) {
  if (typeof prompt !== "string" || prompt.trim().length < 12) return null;
  const code = franc(prompt.trim());
  const language = VOICE_LANGUAGE_CODES[code];
  if (!language) {
    const error = new Error("The requested voice output language is not supported by the multilingual voice model.");
    error.name = "UnsupportedVoiceTargetLanguageError";
    throw error;
  }
  return language;
}

async function findWhisperTranscriptionEndpoint(client) {
  const api = await client.view_api();
  const endpoints = api?.named_endpoints || {};
  const match = Object.entries(endpoints).find(([, endpoint]) => {
    const parameters = endpoint?.parameters || [];
    const components = new Set(parameters.map((parameter) => String(parameter?.component || "").toLowerCase()));
    return parameters.length >= 2 && components.has("audio") && components.has("radio");
  });
  if (!match) throw new Error("Whisper Space exposes no discoverable audio transcription endpoint.");
  return match[0];
}

async function detectVoiceReferenceLanguage(audioFile, clientOptions) {
  const whisper = await withTimeout(
    Client.connect(VOICE_LANGUAGE_SPACE_ID, clientOptions),
    SPACE_CONNECT_TIMEOUT_MS,
    "Timed out connecting to the speech-language detector."
  );
  const endpoint = await withTimeout(
    findWhisperTranscriptionEndpoint(whisper),
    SPACE_CONNECT_TIMEOUT_MS,
    "Timed out discovering the speech-language detector endpoint."
  );
  const result = await predictWithTimeout(
    whisper,
    endpoint,
    [audioFile, "transcribe"],
    VOICE_LANGUAGE_TIMEOUT_MS
  );
  const transcript = result?.data?.find((value) => typeof value === "string") || "";
  const language = detectReferenceLanguage(transcript);
  if (!language) {
    const error = new Error(
      "Could not reliably detect a supported language from the reference audio. Upload a clear sample with at least 10 seconds of speech."
    );
    error.name = "UnsupportedReferenceLanguageError";
    throw error;
  }
  return language;
}


async function voiceAudioToGradioFile(dataUrl) {
  const match = /^data:(audio\x2f(?:wav|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid voice reference audio data URL.");
  const mimeType = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.byteLength > MAX_VOICE_AUDIO_BYTES) throw new Error("Voice reference audio exceeds the 3 MiB inference payload limit.");
  let duration;
  try {
    const metadata = await parseBuffer(bytes, { mimeType }, { duration: true, skipCovers: true });
    duration = metadata.format.duration;
  } catch {
    throw new Error("Could not read the audio duration. Upload a valid audio file at least 10 seconds long.");
  }
  if (!Number.isFinite(duration) || duration < MIN_VOICE_AUDIO_DURATION_SECONDS) {
    throw new Error("Voice reference audio must be at least 10 seconds long.");
  }
  const extension = mimeType.includes("wav") ? "wav" : mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "webm";
  return handle_file(new File([bytes], "voice-reference." + extension, { type: mimeType }));
}

function referenceImageToGradioFile(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid reference image data URL.");
  const mimeType = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.byteLength > 3 * 1024 * 1024) throw new Error("Reference image exceeds the 3 MiB inference payload limit.");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  return handle_file(new File([bytes], "reference-image." + extension, { type: mimeType }));
}

async function releaseGenerationReservation(db, ref, reservation) {
  if (!db || !ref || !reservation?.allowed) return;
  try {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const data = snapshot.data();
      const currentWindowStart = data.windowStartedAt?.toMillis?.() || 0;
      if (currentWindowStart !== reservation.startedAt) return;
      const currentCount = Math.max(0, Number(data.count || 0));
      if (currentCount === 0) return;
      tx.set(ref, {
        count: currentCount - 1,
        updatedAt: Timestamp.now()
      }, { merge: true });
    });
  } catch (error) {
    console.error("[image-generation:quota-refund] Unable to refund a failed generation reservation:", error?.message || error);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: localized(req, "Método não permitido.", "Method not allowed.")
    });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: localized(req, "Entre com Google, GitHub ou e-mail e senha com endereço verificado para gerar imagens.", "Sign in with Google, GitHub, or email and password with a verified address to generate images.")
    });
  }

  let phase = "firebase-auth";
  let db = null;
  let quotaRef = null;
  let reservation = null;

  try {
    const app = getAdminApp();
    let user;
    try {
      user = await getAuth(app).verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({
        error: localized(req, "Sua sessão é inválida ou expirou. Entre novamente.", "Your session is invalid or has expired. Please sign in again.")
      });
    }

    const signInProvider = user.firebase?.sign_in_provider;
    if (signInProvider === "password" && user.email_verified !== true) {
      return res.status(403).json({ error: localized(req, "Verifique seu e-mail antes de gerar imagens.", "Verify your email before generating images.") });
    }
    if (!["google.com", "github.com", "password"].includes(signInProvider)) {
      return res.status(403).json({
        error: localized(req, "Use Google, GitHub ou e-mail e senha para gerar imagens.", "Use Google, GitHub, or email and password to generate images.")
      });
    }

    const { prompt, model = "aoxo/flux.1dev-abliterated", width = 768, height = 768, steps = 20, referenceImage = null, voiceAudio = null } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        error: localized(req, "O prompt deve ter entre 1 e 1500 caracteres.", "The prompt must contain between 1 and 1500 characters.")
      });
    }

    const allowedModels = new Set([FLUX_MODEL_ID, QWYTHOS_MODEL_ID, COSMOS_MODEL_ID, QWEN_MODEL_ID, VOICE_CLONE_MODEL_ID]);
    const isQwythos = model === QWYTHOS_MODEL_ID;
    const isCosmos = model === COSMOS_MODEL_ID;
    const isQwen = model === QWEN_MODEL_ID;
    const isVoiceClone = model === VOICE_CLONE_MODEL_ID;
    if (!allowedModels.has(model)) return res.status(400).json({ error: localized(req, "O modelo selecionado não é compatível.", "The selected model is not supported.") });
    if (isCosmos && !envEnabled(process.env.ENABLE_COSMOS_VIDEO)) return res.status(503).json({ error: localized(req, "O modo de vídeo Cosmos foi desativado pela configuração ENABLE_COSMOS_VIDEO. Defina-a como true para permitir a tentativa real; o Space continuará verificando GPU e disco.", "Cosmos video is disabled by ENABLE_COSMOS_VIDEO. Set it to true to allow a real attempt; the Space will still check GPU and disk resources.") });
    if (isQwen && !envEnabled(process.env.ENABLE_QWEN_TEXT)) return res.status(503).json({ error: localized(req, "O modo de texto Qwen foi desativado pela configuração ENABLE_QWEN_TEXT. Defina-a como true para permitir a tentativa real; o Space continuará verificando RAM e disco.", "Qwen text is disabled by ENABLE_QWEN_TEXT. Set it to true to allow a real attempt; the Space will still check RAM and disk.") });
    if (isQwythos && !referenceImage) {
      return res.status(400).json({
        error: localized(req, "Envie uma imagem de referência para usar Qwythos com instruções.", "Upload a reference image to use Qwythos with instructions.")
      });
    }
    if (isVoiceClone && (!voiceAudio || typeof voiceAudio !== "string" || !/^data:audio\x2f(?:wav|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a);base64,[A-Za-z0-9+/]+={0,2}$/i.test(voiceAudio) || voiceAudio.length > 4_200_000)) return res.status(400).json({ error: localized(req, "Envie um áudio de referência válido de até 3 MiB e com pelo menos 10 segundos.", "Upload a valid voice reference audio file up to 3 MiB and at least 10 seconds long.") });
    if (!isVoiceClone && voiceAudio !== null) return res.status(400).json({ error: localized(req, "O áudio de referência só é aceito no modelo de clonagem de voz.", "Voice reference audio is only accepted for the voice-cloning model.") });
    if (referenceImage !== null && (!isQwythos || typeof referenceImage !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(referenceImage) || referenceImage.length > 4_200_000)) {
      return res.status(400).json({ error: localized(req, "Imagem inválida ou grande demais. Envie uma imagem compatível; a versão preparada para inferência pode ter até 3 MB.", "Invalid or oversized image. Upload a supported image; the prepared inference image may be up to 3 MB.") });
    }
    let referenceImageFile = null;
    if (referenceImage !== null) {
      try {
        referenceImageFile = referenceImageToGradioFile(referenceImage);
      } catch {
        return res.status(400).json({ error: localized(req, "Não foi possível preparar a imagem para o Qwythos. Selecione a imagem novamente e tente outra vez.", "Could not prepare the image for Qwythos. Select the image again and retry.") });
      }
    }
    let voiceAudioFile = null;
    if (isVoiceClone) {
      try { voiceAudioFile = await voiceAudioToGradioFile(voiceAudio); }
      catch { return res.status(400).json({ error: localized(req, "Não foi possível preparar o áudio. Use WAV, MP3, OGG, WebM ou M4A de até 3 MiB e com pelo menos 10 segundos.", "Could not prepare the audio. Use WAV, MP3, OGG, WebM, or M4A up to 3 MiB and at least 10 seconds long.") }); }
    }
    const allowedSizes = new Set(["768x768", "1024x768", "768x1024"]);
    if (!isCosmos && !isQwen && !isVoiceClone && (!allowedSizes.has(width + "x" + height) || ![20, 28].includes(Number(steps)))) {
      return res.status(400).json({
        error: localized(req, "A configuração da imagem é inválida.", "The image settings are invalid.")
      });
    }

    const spaceId = String(process.env.HF_SPACE_ID || "").trim();
    if (!isVoiceClone && !spaceId) {
      return res.status(503).json({
        error: localized(req, "O Space do Hugging Face não está configurado no servidor. Defina HF_SPACE_ID=ErikrafT/erikraft-ai no ambiente Vercel.", "The Hugging Face Space is not configured on the server. Set HF_SPACE_ID=ErikrafT/erikraft-ai in the Vercel environment.")
      });
    }
    if (!isVoiceClone && spaceId.toLowerCase() !== "erikraft/erikraft-ai") {
      return res.status(503).json({
        error: localized(req, "HF_SPACE_ID está configurado, mas não aponta para ErikrafT/erikraft-ai.", "HF_SPACE_ID is configured, but it does not point to ErikrafT/erikraft-ai.")
      });
    }
    const spaceApiSecret = String(process.env.HF_SPACE_API_SECRET || "").trim();
    if ((isCosmos || isQwen) && spaceApiSecret.length < 32) {
      return res.status(503).json({ error: localized(req, "Os modelos experimentais exigem HF_SPACE_API_SECRET como segredo no backend Vercel e no Space do Hugging Face.", "Experimental models require HF_SPACE_API_SECRET as a secret in both the Vercel backend and the Hugging Face Space.") });
    }

    phase = "quota-check";
    db = getFirestore(app);
    const limit = getAccountMaxPerWindow();
    quotaRef = db.collection("generation_limits").doc(user.uid);
    const now = Date.now();

    reservation = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(quotaRef);
      const data = snapshot.exists ? snapshot.data() : {};
      const startedAt = data.windowStartedAt?.toMillis?.() || 0;
      const active = startedAt > now - WINDOW_MS;
      const count = active ? Number(data.count || 0) : 0;
      if (count >= limit) return { allowed: false, count, startedAt };
      const windowStartedAt = active ? startedAt : now;
      tx.set(quotaRef, {
        count: count + 1,
        windowStartedAt: Timestamp.fromMillis(windowStartedAt),
        tier: "account",
        updatedAt: Timestamp.now()
      }, { merge: true });
      return { allowed: true, count: count + 1, startedAt: windowStartedAt };
    });

    if (!reservation.allowed) {
      return res.status(429).json({
        error: localized(req,
          "Você atingiu o limite gratuito de gerações por hora nesta conta. Tente novamente depois que a cota for renovada.",
          "You have reached this account’s free hourly generation limit. Please try again after the quota resets."),
        limit,
        remaining: 0,
        resetAt: reservation.startedAt + WINDOW_MS
      });
    }

    phase = "space-connect";
    const clientOptions = process.env.HF_TOKEN ? { token: process.env.HF_TOKEN } : {};
    let voiceLanguage = null;
    if (isVoiceClone) {
      phase = "voice-language-detection";
      try {
        // XTTS language selection follows the requested speech text, not the website locale.
        // For very short text, fall back to the detected reference voice language.
        voiceLanguage = detectVoicePromptLanguage(prompt)
          || await detectVoiceReferenceLanguage(voiceAudioFile, clientOptions);
      } catch (error) {
        console.error("[image-generation:voice-language-detection]", error?.stack || error?.message || error);
        await releaseGenerationReservation(db, quotaRef, reservation);
        reservation = null;
        const unsupported = error?.name === "UnsupportedReferenceLanguageError"
          || error?.name === "UnsupportedVoiceTargetLanguageError";
        return res.status(unsupported ? 422 : 503).json({
          error: localized(
            req,
            unsupported
              ? "O idioma solicitado para a fala não foi reconhecido ou não é compatível com a clonagem multilíngue. Use inglês, português, espanhol, francês, alemão, italiano, polonês, turco, russo, holandês, tcheco, árabe, chinês, japonês, coreano ou húngaro."
              : "A detecção do idioma está temporariamente indisponível. Tente novamente mais tarde.",
            unsupported
              ? "The requested speech language was not recognized or is unsupported by multilingual voice cloning. Use English, Portuguese, Spanish, French, German, Italian, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Korean, or Hungarian."
              : "Language detection is temporarily unavailable. Please try again later."
          )
        });
      }
    }

    const targetSpaceId = isVoiceClone ? VOICE_CLONE_SPACE_ID : spaceId;
    const client = await withTimeout(
      Client.connect(targetSpaceId, clientOptions),
      SPACE_CONNECT_TIMEOUT_MS,
      "Timed out connecting to the Hugging Face Space."
    );

    let result;
    if (isVoiceClone) {
      phase = "space-voice-clone";
      result = await predictWithTimeout(
        client,
        "/predict",
        [prompt.trim(), voiceAudioFile, voiceLanguage],
        VOICE_CLONE_TIMEOUT_MS
      );
      const first = result?.data?.[0];
      const audioUrl = typeof first === "string" ? first : (first?.url || first?.path || first?.audio?.url || first?.audio?.path);
      if (!audioUrl) throw new Error("Multilingual voice-clone Space returned no recognized audio URL.");
      return res.status(200).json({ type: "audio", audioUrl, detectedLanguage: voiceLanguage, limit, remaining: Math.max(0, limit - reservation.count), tier: "account" });
    } else if (isCosmos) {
      phase = "space-video";
      result = await predictWithTimeout(client, "/generate_video", [prompt.trim(), spaceApiSecret]);
      const first = result?.data?.[0];
      const videoUrl = typeof first === "string" ? first : (first?.url || first?.path || first?.video?.url || first?.video?.path);
      if (!videoUrl) throw new Error("Space returned no recognized video URL.");
      return res.status(200).json({ type: "video", videoUrl, limit, remaining: Math.max(0, limit - reservation.count), tier: "account" });
    } else if (isQwen) {
      phase = "space-text";
      result = await predictWithTimeout(client, "/generate_text", [prompt.trim(), "auto", spaceApiSecret], QWEN_INFERENCE_TIMEOUT_MS);
      const first = result?.data?.[0];
      const answer = typeof first === "string" ? first : (first?.text || first?.value || first?.content || "");
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Space returned no recognized text response.");
      return res.status(200).json({ type: "text", text: answer.slice(0, 12000), limit, remaining: Math.max(0, limit - reservation.count), tier: "account" });
    } else if (isQwythos) {
      phase = "space-interpret";
      const interpretation = await client.predict(
        "/generate_image_from_image",
        [prompt.trim(), referenceImageFile, "auto"]
      );
      const interpreted = interpretation?.data?.[0];
      const generatedPrompt = typeof interpreted === "string"
        ? interpreted
        : (interpreted?.text || interpreted?.value || "");
      if (typeof generatedPrompt !== "string" || !generatedPrompt.trim()) {
        throw new Error("Qwythos returned no usable image-generation prompt.");
      }

      // Keep model calls separate: Qwythos interpretation and FLUX rendering each use
      // their own GPU duration budget instead of requesting 450 seconds in one call.
      phase = "space-generate";
      result = await client.predict(
        "/generate_image",
        [generatedPrompt.trim().slice(0, MAX_PROMPT_LENGTH), Number(width), Number(height), Number(steps)]
      );
    } else {
      phase = "space-generate";
      result = await client.predict(
        "/generate_image",
        [prompt.trim(), Number(width), Number(height), Number(steps)]
      );
    }

    const first = result?.data?.[0];
    const imageUrl = typeof first === "string"
      ? first
      : (first?.url || first?.path || first?.image?.url);

    if (!imageUrl) {
      console.error("[image-generation:space-generate] Space returned an unexpected Gradio result shape.", {
        dataIsArray: Array.isArray(result?.data),
        dataLength: Array.isArray(result?.data) ? result.data.length : null,
        firstResultKeys: first && typeof first === "object" ? Object.keys(first) : []
      });
      await releaseGenerationReservation(db, quotaRef, reservation);
      reservation = null;
      return res.status(502).json({
        error: localized(req,
          "O Space respondeu, mas não retornou uma URL de imagem reconhecida. Confira o endpoint e a saída da API do Space.",
          "The Space responded but did not return a recognized image URL. Check the Space API endpoint and output format.")
      });
    }

    return res.status(200).json({
      imageUrl,
      limit,
      remaining: Math.max(0, limit - reservation.count),
      tier: "account",
      message: localized(req, "Limite da conta: 5 gerações por hora.", "Account limit: 5 generations per hour.")
    });
  } catch (error) {
    const rawMessage = String(error?.message || error || "Unknown error");
    const normalized = rawMessage.toLowerCase();

    if (reservation?.allowed) {
      await releaseGenerationReservation(db, quotaRef, reservation);
      reservation = null;
    }

    console.error("[image-generation:" + phase + "]", error?.stack || rawMessage);

    if (phase === "space-video" || phase === "space-text") {
      const timedOut = error?.name === "InferenceTimeoutError" || /exceeded its server-side time budget/.test(normalized);
      const diskFailure = /disk|no space left|not enough space|cache.*space/.test(normalized);
      const memoryFailure = /out of memory|cuda.*memory|vram|free ram|available.*ram|system ram|requires a compatible cuda gpu|requires.*gpu/.test(normalized);
      const quotaFailure = /zerogpu|gpu quota|quota.*gpu|rate.?limit|too many requests/.test(normalized);
      const resourceError = phase === "space-video"
        ? (diskFailure
            ? localized(req,
                "O Cosmos não tem espaço de cache suficiente no Hugging Face Space. Verifique o disco disponível e os logs antes de tentar novamente.",
                "Cosmos does not have enough model-cache disk space in the Hugging Face Space. Check free disk space and Space logs before retrying.")
            : memoryFailure
              ? localized(req,
                  "O Cosmos exige uma GPU CUDA compatível, da classe de 48 GB, com VRAM livre e espaço de cache suficientes. O hardware gratuito pode não atender a esses requisitos; confira os logs do Space.",
                  "Cosmos requires a compatible 48 GB-class CUDA GPU, sufficient free VRAM, and model-cache disk space. Free hardware may not meet these requirements; check Space logs.")
              : quotaFailure
                ? localized(req,
                    "A cota ou a fila do ZeroGPU pode estar impedindo a geração. Confira a cota diária e os logs do Hugging Face antes de repetir.",
                    "The ZeroGPU quota or queue may be preventing generation. Check the daily quota and Hugging Face logs before retrying.")
                : localized(req,
                    "O Cosmos não concluiu a geração de vídeo. Confira os logs recentes do Hugging Face Space para distinguir erro do modelo, fila e limites de hardware.",
                    "Cosmos did not complete video generation. Check recent Hugging Face Space logs to distinguish model errors, queue issues, and hardware limits."))
        : (diskFailure
            ? localized(req,
                "O Qwen não tem espaço livre suficiente para baixar o arquivo GGUF. Confira o disco do Space antes de repetir.",
                "Qwen does not have enough free disk space to download the GGUF file. Check Space disk capacity before retrying.")
            : memoryFailure
              ? localized(req,
                  "O Qwen precisa de aproximadamente 12 GiB de RAM disponível e está limitado à CPU neste Space. A memória gratuita disponível pode não ser suficiente; confira os logs.",
                  "Qwen needs roughly 12 GiB of available RAM and is CPU-only in this Space. Free-tier available memory may be insufficient; check the logs.")
              : localized(req,
                  "O Qwen não concluiu a resposta dentro das condições atuais do Space. Confira os logs e aguarde antes de repetir, pois uma carga ou inferência anterior pode continuar em execução.",
                  "Qwen did not complete a response under the Space's current conditions. Check the logs and wait before retrying because a previous load or inference may still be running."));
      return res.status(timedOut ? 504 : 503).json({
        error: timedOut
          ? (phase === "space-text"
              ? localized(req,
                  "O Qwen não respondeu em 235 segundos. A geração foi encerrada para evitar espera indefinida; confira os logs do Space e aguarde antes de repetir.",
                  "Qwen did not respond within 235 seconds. The request was stopped to avoid an indefinite wait; check Space logs and wait before retrying.")
              : localized(req,
                  "A inferência experimental ultrapassou o limite de tempo do servidor. O processamento pode continuar na fila do Space; aguarde antes de repetir para evitar solicitações duplicadas.",
                  "Experimental inference exceeded the server time budget. Processing may still be queued in the Space; wait before retrying to avoid duplicate requests."))
          : resourceError
      });
    }

    if (phase === "firebase-auth") {
      return res.status(503).json({
        error: localized(req,
          "Não foi possível validar a conta no servidor. Verifique as variáveis e as credenciais do Firebase e variáveis do backend do site.",
          "The server could not validate the account. Check the Firebase credentials and server-side backend environment variables.")
      });
    }

    if (phase === "quota-check") {
      return res.status(503).json({
        error: localized(req,
          "Não foi possível consultar ou atualizar a cota da conta no Firestore. Isso não significa que a cota do Hugging Face acabou; verifique as permissões e os logs do Firebase.",
          "The account quota could not be read or updated in Firestore. This does not mean the Hugging Face quota is exhausted; check Firebase permissions and logs.")
      });
    }

    if (/requested gpu duration|larger than the maximum allowed/.test(normalized)) {
      return res.status(503).json({
        error: localized(req,
          "O ZeroGPU rejeitou a reserva de GPU do Qwythos. O código atualizado limita a duração declarada a 180 segundos; se o erro ainda mencionar 450 s, confira se o Space concluiu o rebuild e está usando o commit mais recente.",
          "ZeroGPU rejected the Qwythos GPU reservation. The updated code caps its declared duration at 180 seconds; if the error still reports 450s, verify that the Space finished rebuilding and is running the latest commit.")
      });
    }

    if (/quota|rate.?limit|too many requests|resource exhausted|gpu.?time|\b429\b/.test(normalized)) {
      return res.status(429).json({
        error: localized(req,
          "O Hugging Face informou um limite de uso ou cota do provedor. Isso é diferente da cota por conta do site. Confira a disponibilidade e a cota do seu Space.",
          "Hugging Face reported a provider usage limit or quota. This is separate from the website's account quota. Check your Space availability and quota.")
      });
    }

    if (/invalid token|unauthorized|unauthorised|forbidden|\b401\b|\b403\b/.test(normalized)) {
      return res.status(502).json({
        error: localized(req,
          "O Hugging Face recusou a autenticação do backend. Confira se HF_TOKEN é um token válido com acesso ao Space e se está configurado como variável secreta no backend do site.",
          "Hugging Face rejected the backend authentication. Check that HF_TOKEN is valid, has access to the Space, and is configured as a server-side backend secret.")
      });
    }

    if (/endpoint|api.?name|not found|could not find|does not exist|\b404\b/.test(normalized)) {
      return res.status(502).json({
        error: localized(req,
          "O endpoint de geração do Space não corresponde ao esperado. Abra a página Use via API do Hugging Face e confira se /generate_image ainda existe e quais parâmetros ele aceita.",
          "The Space generation endpoint does not match what the site expects. Open Hugging Face's Use via API page and check whether /generate_image exists and which parameters it accepts.")
      });
    }

    if (/sleep|starting|warming|not ready|unavailable|timed out|timeout|econn|fetch failed|\b503\b/.test(normalized)) {
      return res.status(503).json({
        error: localized(req,
          "O Space do Hugging Face está iniciando, ocupado ou temporariamente indisponível. Aguarde um pouco e tente novamente; isso não confirma que a cota foi esgotada.",
          "The Hugging Face Space is starting, busy, or temporarily unavailable. Wait a little and try again; this does not confirm that the quota is exhausted.")
      });
    }

    if (phase === "space-voice-clone" && /requested gpu duration|gpu duration.{0,30}(exceed|limit|maximum)|exceed.{0,30}gpu.{0,20}duration|ran for longer than.{0,20}(60|one minute)/.test(normalized)) {
      return res.status(503).json({
        error: localized(req,
          "O Space de clonagem rejeitou ou excedeu o limite de duração de GPU por solicitação. Isso não confirma cota da sua conta esgotada. Verifique os logs do Space Nymbo/Voice-Clone-Multilingual; se a síntese for longa, tente um texto menor e uma amostra de referência mais curta.",
          "The voice-cloning Space rejected or exceeded its per-request GPU duration limit. This does not confirm that your account quota is exhausted. Check Nymbo/Voice-Clone-Multilingual Space logs; for long synthesis, try shorter text and a shorter reference sample.")
      });
    }

    if (phase === "voice-language-detection" || phase === "space-voice-clone") {
      const timedOut = error?.name === "InferenceTimeoutError" || /timed out|timeout|exceeded its server-side time budget/.test(normalized);
      const languageStep = phase === "voice-language-detection";
      return res.status(timedOut ? 504 : 502).json({
        error: timedOut
          ? localized(req,
              languageStep
                ? "A detecção do idioma do áudio de referência demorou demais. Verifique os logs do backend e do Space Whisper; confirme que o Space está ativo antes de tentar novamente."
                : "A clonagem de voz excedeu o tempo limite do provedor. Verifique os logs do backend e do Space de clonagem; a tarefa pode ainda estar na fila, então aguarde antes de repetir.",
              languageStep
                ? "Reference-audio language detection timed out. Check the backend and Whisper Space logs, and confirm the Space is running before retrying."
                : "Voice cloning exceeded the provider timeout. Check the backend and voice-cloning Space logs; the task may still be queued, so wait before retrying.")
          : localized(req,
              languageStep
                ? "Falha ao detectar o idioma do áudio de referência no Space Whisper. Confira os logs da função /api/generate e do Space Whisper para identificar a causa."
                : "O Space de clonagem de voz falhou durante a síntese. Confira os logs da função /api/generate e do Space de clonagem para identificar a causa. Isso não confirma cota esgotada.",
              languageStep
                ? "The Whisper Space failed to detect the reference-audio language. Check /api/generate function logs and the Whisper Space logs to identify the cause."
                : "The voice-cloning Space failed during synthesis. Check /api/generate function logs and the voice-cloning Space logs to identify the cause. This does not confirm quota exhaustion.")
      });
    }

    return res.status(502).json({
      error: localized(req,
        "A geração falhou por um erro do Space ou da integração, sem confirmação de cota esgotada. Confira os logs do backend para /api/generate para identificar a causa.",
        "Generation failed because of a Space or integration error; quota exhaustion was not confirmed. Check the server-side /api/generate logs to identify the cause.")
    });
  }
}

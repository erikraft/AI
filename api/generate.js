import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { Client } from "@gradio/client";

const WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_MAX_PER_WINDOW = 5;
const MAX_PROMPT_LENGTH = 1500;

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

    const { prompt, model = "aoxo/flux.1dev-abliterated", width = 768, height = 768, steps = 20, referenceImage = null } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        error: localized(req, "O prompt deve ter entre 1 e 1500 caracteres.", "The prompt must contain between 1 and 1500 characters.")
      });
    }

    const allowedModels = new Set(["aoxo/flux.1dev-abliterated", "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"]);
    if (referenceImage !== null && (model !== "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated" || typeof referenceImage !== "string" || !/^data:image\/(png|jpeg|webp);base64,/i.test(referenceImage) || referenceImage.length > 4_200_000)) {
      return res.status(400).json({ error: localized(req, "Imagem inválida. Use PNG, JPG ou WebP de até 3 MB com o modelo Qwythos.", "Invalid image. Use a PNG, JPG, or WebP up to 3 MB with the Qwythos model.") });
    }
    if (!allowedModels.has(model)) return res.status(400).json({ error: localized(req, "O modelo selecionado não é compatível.", "The selected model is not supported.") });
    const allowedSizes = new Set(["768x768", "1024x768", "768x1024"]);
    if (model === "aoxo/flux.1dev-abliterated" && (!allowedSizes.has(width + "x" + height) || ![20, 28].includes(Number(steps)))) {
      return res.status(400).json({
        error: localized(req, "A configuração da imagem é inválida.", "The image settings are invalid.")
      });
    }

    const spaceId = process.env.HF_SPACE_ID;
    if (!spaceId) {
      return res.status(503).json({
        error: localized(req, "O Space do Hugging Face não está configurado no servidor. Verifique HF_SPACE_ID.", "The Hugging Face Space is not configured on the server. Check HF_SPACE_ID.")
      });
    }

    phase = "quota-check";
    db = getFirestore(app);
    const limit = ACCOUNT_MAX_PER_WINDOW;
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
          "Você atingiu o limite gratuito de 5 gerações por hora nesta conta. Tente novamente depois que a cota for renovada.",
          "You have reached the free limit of 5 generations per hour for this account. Please try again after the quota resets."),
        limit,
        remaining: 0,
        resetAt: reservation.startedAt + WINDOW_MS
      });
    }

    phase = "space-connect";
    const clientOptions = process.env.HF_TOKEN ? { token: process.env.HF_TOKEN } : {};
    const client = await Client.connect(spaceId, clientOptions);

    phase = "space-generate";
    const isQwythos = model === "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated";
    const result = isQwythos
      ? referenceImage
        ? await client.predict("/generate_image_from_image", [prompt.trim(), { url: referenceImage }, Number(width), Number(height), Number(steps), requestLanguage(req)])
        : await client.predict("/generate_prompt", [prompt.trim(), requestLanguage(req)])
      : await client.predict("/generate_image", [prompt.trim(), Number(width), Number(height), Number(steps)]);

    const first = result?.data?.[0];
    if (isQwythos && !referenceImage) {
      const text = typeof first === "string" ? first : (first?.text || first?.value || "");
      if (!text.trim()) {
        await releaseGenerationReservation(db, quotaRef, reservation);
        reservation = null;
        return res.status(502).json({ error: localized(req, "Qwythos não retornou texto. Verifique o estado do Space e tente novamente.", "Qwythos returned no text. Check the Space status and try again.") });
      }
      return res.status(200).json({ text: text.trim(), model, limit, remaining: Math.max(0, limit - reservation.count), tier: "account" });
    }
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

    if (phase === "firebase-auth") {
      return res.status(503).json({
        error: localized(req,
          "Não foi possível validar a conta no servidor. Verifique as variáveis e as credenciais do Firebase no Vercel.",
          "The server could not validate the account. Check the Firebase credentials and environment variables in Vercel.")
      });
    }

    if (phase === "quota-check") {
      return res.status(503).json({
        error: localized(req,
          "Não foi possível consultar ou atualizar a cota da conta no Firestore. Isso não significa que a cota do Hugging Face acabou; verifique as permissões e os logs do Firebase.",
          "The account quota could not be read or updated in Firestore. This does not mean the Hugging Face quota is exhausted; check Firebase permissions and logs.")
      });
    }

    if (/quota|rate.?limit|too many requests|resource exhausted|gpu.?time|\b429\b/.test(normalized)) {
      return res.status(429).json({
        error: localized(req,
          "O Hugging Face informou um limite de uso ou cota do provedor. Isso é diferente da cota de 5 gerações por hora do site. Confira a disponibilidade e a cota do seu Space.",
          "Hugging Face reported a provider usage limit or quota. This is separate from the website's five-generations-per-hour limit. Check your Space availability and quota.")
      });
    }

    if (/invalid token|unauthorized|unauthorised|forbidden|\b401\b|\b403\b/.test(normalized)) {
      return res.status(502).json({
        error: localized(req,
          "O Hugging Face recusou a autenticação do backend. Confira se HF_TOKEN é um token válido com acesso ao Space e se está configurado nas variáveis do Vercel.",
          "Hugging Face rejected the backend authentication. Check that HF_TOKEN is valid, has access to the Space, and is configured in Vercel environment variables.")
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

    return res.status(502).json({
      error: localized(req,
        "A geração falhou por um erro do Space ou da integração, sem confirmação de cota esgotada. Confira os logs da função /api/generate no Vercel para identificar a causa.",
        "Generation failed because of a Space or integration error; quota exhaustion was not confirmed. Check the /api/generate function logs in Vercel to identify the cause.")
    });
  }
}

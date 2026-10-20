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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Autentique-se com Google ou GitHub para gerar imagens." });
  }

  try {
    const app = getAdminApp();
    let user;
    try {
      user = await getAuth(app).verifyIdToken(match[1]);
    } catch {
      return res.status(401).json({ error: "Sessão inválida ou expirada. Entre novamente." });
    }

    const signInProvider = user.firebase?.sign_in_provider;
    if (!["google.com", "github.com"].includes(signInProvider)) {
      return res.status(403).json({ error: "Use uma conta conectada pelo Google ou GitHub para gerar imagens." });
    }

    const { prompt, width = 768, height = 768, steps = 20 } = req.body || {};
    if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({ error: "O prompt deve ter entre 1 e 1500 caracteres." });
    }
    const allowedSizes = new Set(["768x768", "1024x768", "768x1024"]);
    if (!allowedSizes.has(width + "x" + height) || ![20, 28].includes(Number(steps))) {
      return res.status(400).json({ error: "Configuração de imagem inválida." });
    }
    const spaceId = process.env.HF_SPACE_ID;
    if (!spaceId) return res.status(503).json({ error: "O Space de geração ainda não foi configurado." });

    const db = getFirestore(app);
    const limit = ACCOUNT_MAX_PER_WINDOW;
    const ref = db.collection("generation_limits").doc(user.uid);
    const now = Date.now();
    const reservation = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const startedAt = data.windowStartedAt?.toMillis?.() || 0;
      const active = startedAt > now - WINDOW_MS;
      const count = active ? Number(data.count || 0) : 0;
      if (count >= limit) return { allowed: false, count, startedAt };
      const windowStartedAt = active ? startedAt : now;
      tx.set(ref, {
        count: count + 1,
        windowStartedAt: Timestamp.fromMillis(windowStartedAt),
        tier: "account",
        updatedAt: Timestamp.now()
      }, { merge: true });
      return { allowed: true, count: count + 1, startedAt: windowStartedAt };
    });
    if (!reservation.allowed) {
      const message = "Limite gratuito atingido: até 5 gerações por hora por conta. Tente novamente mais tarde.";
      return res.status(429).json({ error: message, limit, remaining: 0, resetAt: reservation.startedAt + WINDOW_MS });
    }

    const client = await Client.connect(spaceId, process.env.HF_TOKEN ? { hf_token: process.env.HF_TOKEN } : {});
    const result = await client.predict("/generate_image", [prompt.trim(), Number(width), Number(height), Number(steps)]);
    const first = result?.data?.[0];
    const imageUrl = typeof first === "string" ? first : (first?.url || first?.path || first?.image?.url);
    if (!imageUrl) {
      console.error("Unexpected Gradio response shape");
      return res.status(502).json({ error: "O Space não retornou uma imagem válida." });
    }
    return res.status(200).json({
      imageUrl,
      limit,
      remaining: Math.max(0, limit - reservation.count),
      tier: "account",
      message: "Limite de conta: 5 gerações por hora."
    });
  } catch (error) {
    console.error("Image generation failed:", error?.message || error);
    return res.status(503).json({ error: "Não foi possível gerar agora. O provedor pode estar ocupado ou sem cota gratuita." });
  }
}

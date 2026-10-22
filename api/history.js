import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { MongoClient, ObjectId } from "mongodb";

const DATABASE_NAME = process.env.MONGODB_DATABASE || "ErikrafTAI";
const COLLECTION_NAME = "user_history";
const MAX_ITEMS = 100;

let cachedClientPromise;

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function getCollection() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!cachedClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    cachedClientPromise = client.connect().catch((error) => {
      cachedClientPromise = undefined;
      throw error;
    });
  }
  const client = await cachedClientPromise;
  const collection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
  await collection.createIndex({ userId: 1, createdAt: -1 }, { name: "user_history_by_owner_and_date" });
  return collection;
}

async function authenticatedUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(match[1]);
    if (decoded.firebase?.sign_in_provider === "password" && decoded.email_verified !== true) return null;
    if (!["google.com", "github.com", "password"].includes(decoded.firebase?.sign_in_provider)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-30).map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    text: cleanText(message?.text, 4000)
  })).filter((message) => message.text);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });

  try {
    const collection = await getCollection();
    if (req.method === "GET") {
      const records = await collection.find({ userId: user.uid })
        .sort({ createdAt: -1 }).limit(MAX_ITEMS)
        .project({ userId: 0 }).toArray();
      return res.status(200).json({ items: records.map((item) => ({ ...item, _id: item._id.toString() })) });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const type = ["image", "video", "text"].includes(body.type) ? body.type : null;
      const prompt = cleanText(body.prompt, 1500);
      const model = cleanText(body.model, 200);
      const outputText = cleanText(body.outputText, 12000);
      const mediaUrl = cleanText(body.mediaUrl, 2048);
      const messages = cleanMessages(body.messages);
      if (!type || !prompt || !model) return res.status(400).json({ error: "Invalid history entry." });
      if (["image", "video"].includes(type) && (!mediaUrl || !/^https:\/\//i.test(mediaUrl))) {
        return res.status(400).json({ error: "A secure media URL is required." });
      }
      const record = {
        userId: user.uid,
        type,
        prompt,
        model,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(outputText ? { outputText } : {}),
        ...(messages.length ? { messages } : {}),
        createdAt: new Date()
      };
      const inserted = await collection.insertOne(record);
      return res.status(201).json({ item: { ...record, _id: inserted.insertedId.toString() } });
    }

    if (req.method === "DELETE") {
      const id = cleanText(req.query?.id || req.body?.id, 64);
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid history item ID." });
      const result = await collection.deleteOne({ _id: new ObjectId(id), userId: user.uid });
      if (!result.deletedCount) return res.status(404).json({ error: "History item not found." });
      return res.status(200).json({ deleted: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("[history-api]", error?.message || error);
    return res.status(503).json({ error: "History is temporarily unavailable. Check the server database configuration." });
  }
}

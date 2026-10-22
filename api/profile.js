import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { MongoClient } from "mongodb";

const DATABASE_NAME = process.env.MONGODB_DATABASE || "ErikrafTAI";
const COLLECTION_NAME = "profile_photos";
const MAX_PHOTO_BYTES = 1024 * 1024;
let clientPromise;

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}
async function userFromRequest(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const user = await getAuth(adminApp()).verifyIdToken(match[1]);
    if (user.firebase?.sign_in_provider === "password" && user.email_verified !== true) return null;
    if (!["google.com", "github.com", "password"].includes(user.firebase?.sign_in_provider)) return null;
    return user;
  } catch { return null; }
}
async function collection() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect()
      .catch((error) => { clientPromise = undefined; throw error; });
  }
  const client = await clientPromise;
  const coll = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
  await coll.createIndex({ userId: 1 }, { unique: true, name: "profile_photo_by_user" });
  return coll;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  try {
    const photos = await collection();
    if (req.method === "GET") {
      const record = await photos.findOne({ userId: user.uid }, { projection: { _id: 0, userId: 0 } });
      return res.status(200).json(record ? { photo: `data:${record.contentType};base64,${record.data.toString("base64")}` } : { photo: null });
    }
    if (req.method === "PUT") {
      const value = req.body?.photo;
      const match = typeof value === "string" && value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i);
      if (!match) return res.status(400).json({ error: "Choose a PNG, JPEG, or WebP image." });
      const data = Buffer.from(match[2], "base64");
      if (!data.length || data.length > MAX_PHOTO_BYTES) return res.status(413).json({ error: "Profile photos must be 1 MiB or smaller." });
      await photos.replaceOne({ userId: user.uid }, { userId: user.uid, contentType: match[1].toLowerCase(), data, updatedAt: new Date() }, { upsert: true });
      return res.status(200).json({ saved: true, photo: `data:${match[1].toLowerCase()};base64,${data.toString("base64")}` });
    }
    if (req.method === "DELETE") {
      const result = await photos.deleteOne({ userId: user.uid });
      return res.status(200).json({ deleted: result.deletedCount > 0 });
    }
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("[profile-api]", error?.message || error);
    return res.status(503).json({ error: "Profile photo storage is unavailable. Check MongoDB configuration." });
  }
}

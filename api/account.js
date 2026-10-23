import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { MongoClient } from "mongodb";

const DATABASE_NAME = process.env.MONGODB_DATABASE || "ErikrafTAI";
const RECENT_AUTH_SECONDS = 5 * 60;
const ALLOWED_PROVIDERS = new Set(["google.com", "github.com", "password"]);
let clientPromise;

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function authenticatedUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(match[1], true);
    if (!decoded.uid || !ALLOWED_PROVIDERS.has(decoded.firebase?.sign_in_provider)) return null;
    if (decoded.firebase?.sign_in_provider === "password" && decoded.email_verified !== true) return null;
    const authTime = Number(decoded.auth_time);
    const age = Math.floor(Date.now() / 1000) - authTime;
    if (!Number.isFinite(authTime) || age < -30 || age > RECENT_AUTH_SECONDS) {
      const error = new Error("A recent sign-in is required before deleting an account.");
      error.code = "RECENT_LOGIN_REQUIRED";
      throw error;
    }
    return decoded;
  } catch (error) {
    if (error?.code === "RECENT_LOGIN_REQUIRED") throw error;
    return null;
  }
}

async function database() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect()
      .catch((error) => { clientPromise = undefined; throw error; });
  }
  return (await clientPromise).db(DATABASE_NAME);
}

async function deleteMongoUserData(db, uid) {
  // Remove user-owned records from every application collection, not just the
  // currently known history/profile collections, so future userId-backed data
  // is covered by the same account deletion path.
  const collections = await db.listCollections({}).toArray();
  for (const entry of collections) {
    const name = entry.name;
    if (!name || name.startsWith("system.") || entry.type === "view") continue;
    await db.collection(name).deleteMany({ userId: uid });
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let user;
  try {
    user = await authenticatedUser(req);
  } catch (error) {
    if (error?.code === "RECENT_LOGIN_REQUIRED") {
      return res.status(401).json({ code: error.code, error: "Please sign in again before deleting your account." });
    }
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!user) return res.status(401).json({ error: "Authentication required." });

  try {
    const db = await database();
    await deleteMongoUserData(db, user.uid);
    // Delete Firebase Auth last. If database cleanup fails, the user can still
    // sign in and retry; if Auth deletion fails, retrying safely repeats cleanup.
    await getAuth(adminApp()).deleteUser(user.uid);
    return res.status(200).json({ deleted: true });
  } catch (error) {
    console.error("[account-delete-api]", error?.message || error);
    return res.status(503).json({ error: "Account deletion could not be completed. No success was reported; retry after checking server configuration." });
  }
}

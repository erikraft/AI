import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { deleteUserMcpServer, listUserMcpServers, saveUserMcpServer } from "./_lib/mcp.js";

const ALLOWED_PROVIDERS = new Set(["google.com", "github.com", "password"]);

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
    const user = await getAuth(adminApp()).verifyIdToken(match[1]);
    if (!user.uid || !ALLOWED_PROVIDERS.has(user.firebase?.sign_in_provider)) return null;
    if (user.firebase?.sign_in_provider === "password" && user.email_verified !== true) return null;
    return user;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ servers: await listUserMcpServers(user.uid) });
    }
    if (req.method === "POST") {
      if (req.body?.acknowledged !== true) {
        return res.status(400).json({ error: "Confirm that you trust this MCP server before connecting it." });
      }
      const input = req.body || {};
      if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.length > 80) {
        return res.status(400).json({ error: "Server name must contain 1–80 characters." });
      }
      if (typeof input.description === "string" && input.description.length > 500) {
        return res.status(400).json({ error: "Description must be 500 characters or fewer." });
      }
      if (typeof input.url !== "string" || input.url.length > 2048) {
        return res.status(400).json({ error: "Enter a valid MCP server URL." });
      }
      if (input.token != null && (typeof input.token !== "string" || input.token.length > 4096)) {
        return res.status(400).json({ error: "OAuth access tokens must be 4,096 characters or fewer." });
      }
      const server = await saveUserMcpServer(user.uid, input);
      return res.status(201).json({ server, message: "MCP server connected and tools discovered." });
    }
    if (req.method === "DELETE") {
      const id = String(req.query?.id || req.body?.id || "");
      if (!/^[a-f0-9]{24}$/.test(id)) return res.status(400).json({ error: "Invalid MCP server ID." });
      const deleted = await deleteUserMcpServer(user.uid, id);
      return deleted ? res.status(200).json({ deleted: true }) : res.status(404).json({ error: "MCP server not found." });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const message = String(error?.message || error || "MCP server operation failed");
    console.error("[mcp-servers]", message);
    const status = /not found for this account/i.test(message) ? 404
      : /up to 10 MCP servers|must contain|enter a name|provide an OAuth|remove the access token|MCP_ENCRYPTION_KEY|HTTPS URL|private|reserved|hostname|valid MCP server URL|redirects are blocked|authentication failed|HTTP \d+|JSON-RPC|invalid JSON|could not be resolved/i.test(message) ? 400 : 502;
    return res.status(status).json({
      error: status === 502
        ? "Could not connect to the MCP server or discover its tools. Check its endpoint, authentication, and availability."
        : message
    });
  }
}

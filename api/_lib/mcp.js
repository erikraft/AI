import { MongoClient } from "mongodb";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { resolveMcpTarget, requestPinnedMcp, validateMcpUrl } from "./mcp-network.js";
export { validateMcpUrl } from "./mcp-network.js";

const DATABASE_NAME = process.env.MONGODB_DATABASE || "ErikrafTAI";
const COLLECTION_NAME = "qwen_mcp_servers";
const MAX_SERVERS_PER_USER = 10;
const MAX_TOOLS_PER_SERVER = 12;
const MAX_TOOLS_PER_TURN = 6;
const MAX_TOOL_RESULT_CHARS = 1000;
const MCP_RPC_TIMEOUT_MS = 5000;
let clientPromise;
let collectionPromise;
let requestId = 0;

function databaseCollection() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect()
      .catch((error) => { clientPromise = undefined; collectionPromise = undefined; throw error; });
  }
  if (!collectionPromise) {
    collectionPromise = clientPromise.then(async (client) => {
      const collection = client.db(DATABASE_NAME).collection(COLLECTION_NAME);
      // Non-unique indexes support the existing schema without assuming that
      // previously stored server IDs are globally unique across all user data.
      await Promise.all([
        collection.createIndex({ userId: 1, createdAt: -1 }, { name: "mcp_servers_by_owner_and_date" }),
        collection.createIndex({ userId: 1, serverId: 1 }, { name: "mcp_server_by_owner_and_id" })
      ]);
      return collection;
    }).catch((error) => { collectionPromise = undefined; throw error; });
  }
  return collectionPromise;
}

function encryptionKey() {
  const raw = String(process.env.MCP_ENCRYPTION_KEY || "").trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  throw new Error("MCP_ENCRYPTION_KEY must be a 32-byte hex or base64 secret.");
}

export function encryptMcpToken(token) {
  if (!token) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") };
}

function decryptMcpToken(record) {
  if (!record?.encryptedToken) return "";
  const encrypted = record.encryptedToken;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.data, "base64")), decipher.final()]).toString("utf8");
}

async function rpc(server, method, params = {}, { notification = false } = {}) {
  const target = await resolveMcpTarget(server.url);
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (server._protocolVersion) headers["mcp-protocol-version"] = server._protocolVersion;
  if (server._sessionId) headers["mcp-session-id"] = server._sessionId;
  const token = server._token || "";
  if (token) headers.authorization = "Bearer " + token;
  const body = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: ++requestId, method, params };
  const response = await requestPinnedMcp(target, headers, JSON.stringify(body));
  const status = Number(response.statusCode || 0);
  if (status >= 300 && status < 400) {
    response.resume();
    throw new Error("MCP redirects are blocked for security; use the final HTTPS endpoint URL.");
  }
  if (status === 401 || status === 403) {
    response.resume();
    throw new Error("MCP authentication failed. Check the server's OAuth access token and permissions.");
  }
  if (status < 200 || status >= 300) {
    response.resume();
    if (!(notification && status === 202)) throw new Error("MCP server returned HTTP " + status + ".");
  }
  if (notification && (status === 202 || status === 204)) {
    response.resume();
    return null;
  }
  const sessionId = response.headers["mcp-session-id"];
  if (sessionId) server._sessionId = String(sessionId);
  const contentType = String(response.headers["content-type"] || "");
  let payload;

  if (contentType.includes("text/event-stream")) {
    const decoder = new TextDecoder();
    let buffer = "";
    let totalBytes = 0;
    for await (const chunk of response) {
      totalBytes += chunk.byteLength;
      if (totalBytes > 1_000_000) {
        response.destroy();
        throw new Error("MCP event stream exceeded the 1 MB safety limit.");
      }
      buffer += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const event = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
        buffer = buffer.slice(boundary + separator.length);
        const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (body.id == null || parsed.id === body.id) { payload = parsed; break; }
        } catch {}
      }
      if (payload) {
        response.destroy();
        break;
      }
    }
    if (!payload) {
      buffer += decoder.decode();
      if (buffer.trim()) {
        const data = buffer.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (body.id == null || parsed.id === body.id) payload = parsed;
          } catch {}
        }
      }
    }
  } else {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response) {
      totalBytes += chunk.byteLength;
      if (totalBytes > 1_000_000) {
        response.destroy();
        throw new Error("MCP response exceeded the 1 MB safety limit.");
      }
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim()) {
      try { payload = JSON.parse(text); }
      catch { throw new Error("MCP server returned an invalid JSON-RPC response."); }
    }
  }
  if (payload?.error) throw new Error(String(payload.error.message || "MCP JSON-RPC error").slice(0, 300));
  return payload?.result ?? null;
}

async function connectMcp(server) {
  server._token = decryptMcpToken(server);
  server._protocolVersion = "2025-03-26";
  const initialized = await rpc(server, "initialize", {
    protocolVersion: server._protocolVersion,
    capabilities: {},
    clientInfo: { name: "ErikrafT AI", version: "1.0.0" }
  });
  if (initialized?.protocolVersion) server._protocolVersion = initialized.protocolVersion;
  await rpc(server, "notifications/initialized", {}, { notification: true });
  return server;
}

function cleanToolSchema(tool) {
  if (!tool || typeof tool.name !== "string" || !/^[a-zA-Z0-9_.-]{1,96}$/.test(tool.name)) return null;
  const schema = tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : { type: "object", properties: {} };
  const serialized = JSON.stringify(schema);
  if (serialized.length > 900) return null;
  return {
    name: tool.name,
    description: String(tool.description || "MCP tool").slice(0, 350),
    inputSchema: schema,
    readOnlyHint: tool.annotations?.readOnlyHint === true
  };
}

async function discoverTools(server) {
  const connected = await connectMcp(server);
  const result = await rpc(connected, "tools/list", {});
  return (Array.isArray(result?.tools) ? result.tools : []).map(cleanToolSchema).filter(Boolean).slice(0, MAX_TOOLS_PER_SERVER);
}

export async function listUserMcpServers(userId) {
  const collection = await databaseCollection();
  const records = await collection.find({ userId }, { projection: { encryptedToken: 0, userId: 0 } }).sort({ createdAt: -1 }).limit(MAX_SERVERS_PER_USER).toArray();
  return records.map((record) => ({
    id: record.serverId,
    name: record.name,
    description: record.description || "",
    url: record.url,
    connection: record.connection || "url",
    authMode: record.authMode || "NONE",
    allowWriteTools: record.allowWriteTools === true,
    createdAt: record.createdAt
  }));
}

export async function saveUserMcpServer(userId, input) {
  const collection = await databaseCollection();
  const count = await collection.countDocuments({ userId });
  const serverId = String(input.id || "").trim();
  if (!serverId && count >= MAX_SERVERS_PER_USER) throw new Error("You can save up to 10 MCP servers per account.");
  const record = {
    userId,
    serverId: serverId || randomBytes(12).toString("hex"),
    name: String(input.name || "").trim().slice(0, 80),
    description: String(input.description || "").trim().slice(0, 500),
    url: (await validateMcpUrl(input.url)).href,
    connection: input.connection === "tunnel" ? "tunnel" : "url",
    authMode: ["OAUTH", "NONE", "MIXED"].includes(input.authMode) ? input.authMode : "NONE",
    allowWriteTools: input.allowWriteTools === true,
    encryptedToken: input.token ? encryptMcpToken(input.token) : null,
    updatedAt: new Date()
  };
  if (!record.name) throw new Error("Enter a name for this MCP server.");
  if (record.authMode === "OAUTH" && !input.token) throw new Error("Provide an OAuth access token for this server.");
  if (input.authMode === "NONE" && input.token) throw new Error("Remove the access token when authentication is set to None.");
  if (record.authMode === "MIXED" && !input.token) record.encryptedToken = null;
  const probe = { ...record };
  probe._token = input.token || "";
  probe._protocolVersion = "2025-03-26";
  const discoveredTools = await discoverTools(probe);
  if (!discoveredTools.length) throw new Error("No valid MCP tools were discovered at this endpoint.");
  if (serverId) {
    const result = await collection.updateOne({ userId, serverId }, { $set: { ...record, userId, serverId }, $setOnInsert: { createdAt: new Date() } }, { upsert: false });
    if (!result.matchedCount) throw new Error("MCP server not found for this account.");
  } else {
    record.createdAt = new Date();
    await collection.insertOne(record);
  }
  return { id: record.serverId, name: record.name, description: record.description, url: record.url, connection: record.connection, authMode: record.authMode, allowWriteTools: record.allowWriteTools, createdAt: record.createdAt };
}

export async function deleteUserMcpServer(userId, serverId) {
  const collection = await databaseCollection();
  const result = await collection.deleteOne({ userId, serverId: String(serverId || "").slice(0, 40) });
  return result.deletedCount > 0;
}

export async function buildUserMcpToolset(userId) {
  const collection = await databaseCollection();
  const records = await collection.find({ userId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(MAX_SERVERS_PER_USER).toArray();
  const tools = [];
  const toolMap = new Map();
  const warnings = [];
  const discoveredServers = await Promise.all(records.map(async (server) => {
    try {
      return { server, tools: await discoverTools(server), error: null };
    } catch (error) {
      return { server, tools: [], error };
    }
  }));
  for (const entry of discoveredServers) {
    const { server, tools: discovered, error } = entry;
    if (error) {
      warnings.push(server.name + ": " + String(error?.message || error).slice(0, 180));
      continue;
    }
    for (const tool of discovered) {
      if (!tool.readOnlyHint && server.allowWriteTools !== true) continue;
      if (tools.length >= MAX_TOOLS_PER_TURN) break;
      const functionName = ("mcp_" + server.serverId.slice(-8) + "_" + tool.name).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
      if (toolMap.has(functionName)) continue;
      tools.push({
        type: "function",
        function: {
          name: functionName,
          description: (server.name + ": " + tool.description).slice(0, 1000),
          parameters: tool.inputSchema
        }
      });
      toolMap.set(functionName, { serverId: server.serverId, toolName: tool.name });
    }
    if (tools.length >= MAX_TOOLS_PER_TURN) break;
  }
  return { tools, toolMap, warnings };
}

export async function callUserMcpTool(userId, mapping, args) {
  const collection = await databaseCollection();
  const server = await collection.findOne({ userId, serverId: mapping.serverId });
  if (!server) throw new Error("MCP server is no longer configured for this account.");
  const connected = await connectMcp(server);
  const result = await rpc(connected, "tools/call", {
    name: mapping.toolName,
    arguments: args && typeof args === "object" && !Array.isArray(args) ? args : {}
  });
  const content = result?.content;
  const serialized = typeof content === "string" ? content : JSON.stringify(content ?? result ?? {});
  return serialized.slice(0, MAX_TOOL_RESULT_CHARS);
}

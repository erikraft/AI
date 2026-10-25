import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { MongoClient } from "mongodb";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = "https://ai.erikraft.com";
const RESOURCE = ORIGIN + "/api/mcp";
const OAUTH_ROOT = ORIGIN + "/api/oauth";
const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyCVyRjRIL_s0K-e5qRx2xh2L0ucKu_1AXY",
  authDomain: "erikraft-account.firebaseapp.com",
  projectId: "erikraft-account",
  appId: "1:60555596464:web:10085c8ccbe33b96bd2175"
};
function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}
const DATABASE_NAME = process.env.MONGODB_DATABASE || "ErikrafTAI";
let mongoClientPromise;
let oauthCollectionsPromise;
async function oauthCollections() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect()
      .catch((error) => { mongoClientPromise = undefined; oauthCollectionsPromise = undefined; throw error; });
  }
  if (!oauthCollectionsPromise) {
    oauthCollectionsPromise = mongoClientPromise.then(async (client) => {
      const database = client.db(DATABASE_NAME);
      const clients = database.collection("mcp_oauth_clients");
      const codes = database.collection("mcp_oauth_codes");
      const tokens = database.collection("mcp_oauth_tokens");
      await Promise.all([
        clients.createIndex({ client_id: 1 }, { unique: true, name: "mcp_oauth_client_id" }),
        codes.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "mcp_oauth_code_ttl" }),
        tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "mcp_oauth_token_ttl" })
      ]);
      return { clients, codes, tokens };
    }).catch((error) => { oauthCollectionsPromise = undefined; throw error; });
  }
  return oauthCollectionsPromise;
}
function sendJson(res, status, value) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(value));
}
function oauthError(res, status, error, description) {
  return sendJson(res, status, { error, error_description: description });
}
function randomId(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function bodyOf(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch {} try { return Object.fromEntries(new URLSearchParams(req.body)); } catch {} }
  return {};
}
function validateRedirect(uri) {
  if (typeof uri !== "string" || uri.length > 2048) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.hash || parsed.username || parsed.password) return false;
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch { return false; }
}
function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function page(res, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://erikraft-account.firebaseapp.com https://accounts.google.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  return res.status(200).send(html);
}
function loginPage(params) {
  const safe = JSON.stringify(params).replace(/</g, "\\u003c");
  const config = JSON.stringify(FIREBASE_WEB_CONFIG).replace(/</g, "\\u003c");
  return [
    "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"color-scheme\" content=\"light dark\"><title>Conectar ao ErikrafT AI™</title><style>",
    ":root{color-scheme:light dark;--accent:#867d6c;--line:color-mix(in srgb,currentColor 16%,transparent)}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;font:15px/1.5 system-ui,-apple-system,sans-serif}main{width:min(100%,430px);border:1px solid var(--line);border-radius:22px;padding:26px}h1{font-size:22px;margin:14px 0 8px}.muted{opacity:.7;font-size:13px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--accent);color:white;font-weight:800;font-size:23px}button{width:100%;padding:12px 14px;margin-top:12px;border-radius:11px;border:1px solid var(--line);font:inherit;color:inherit;background:transparent;cursor:pointer}button.primary{background:var(--accent);color:white;border-color:transparent;font-weight:650}button:disabled{opacity:.5;cursor:wait}#status{min-height:24px;margin-top:14px;font-size:13px}.error{color:#e66}</style></head><body><main><div class=\"mark\">E</div><h1>Conectar ao ErikrafT AI™</h1><p id="requesting">Um cliente está solicitando autorização para usar as ferramentas do ErikrafT AI™. Entre com sua conta para continuar.</p><p class=\"muted\">Sua senha é enviada diretamente ao Firebase Authentication. Não cole tokens, senhas ou chaves nesta página.</p><button id=\"google\" class=\"primary\">Continuar com Google</button><button id=\"github\">Continuar com GitHub</button><div id=\"status\" role=\"status\" aria-live=\"polite\">Aguardando autenticação…</div><p class=\"muted\">Ao continuar, você autoriza o cliente OAuth que iniciou esta solicitação. O acesso usa um token temporário.</p></main>",
    "<script>window.OAUTH_PARAMS=" + safe + ";window.FIREBASE_CONFIG=" + config + ";</script><script type=\"module\">",
    "import { initializeApp } from \"https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js\";import { getAuth,GoogleAuthProvider,GithubAuthProvider,signInWithPopup } from \"https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js\";",
    "const p=window.OAUTH_PARAMS,status=document.getElementById('status'),app=initializeApp(window.FIREBASE_CONFIG),auth=getAuth(app);document.getElementById('requesting').textContent=(p.client_name||'Um cliente MCP')+' está solicitando autorização para usar as ferramentas do ErikrafT AI™. Entre com sua conta para continuar.';function setStatus(s,e){status.textContent=s;status.className=e?'error':''}async function complete(user){setStatus('Concluindo conexão segura…');try{const token=await user.getIdToken(true),r=await fetch(location.pathname+location.search,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...p,firebase_id_token:token})}),d=await r.json();if(!r.ok)throw new Error(d.error_description||d.error||'Não foi possível concluir a autorização.');if(!d.redirect)throw new Error('Resposta OAuth inválida.');location.assign(d.redirect)}catch(e){setStatus(e.message||'Falha na autenticação.',true)}}for(const [id,Provider] of [['google',GoogleAuthProvider],['github',GithubAuthProvider]])document.getElementById(id).addEventListener('click',async()=>{const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);setStatus('Abrindo login seguro…');try{const provider=new Provider();if(id==='github')provider.addScope('read:user');const result=await signInWithPopup(auth,provider);await complete(result.user)}catch(e){setStatus(e.code==='auth/popup-blocked'?'O navegador bloqueou a janela de login. Permita pop-ups e tente novamente.':e.message||'Falha na autenticação.',true);buttons.forEach(b=>b.disabled=false)}});</script></body></html>"
  ].join("");
}
async function handleRegistration(req, res) {
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request", "Use POST.");
  const body = bodyOf(req), redirects = body.redirect_uris;
  if (!Array.isArray(redirects) || !redirects.length || redirects.length > 20 || redirects.some(uri => !validateRedirect(uri))) {
    return oauthError(res, 400, "invalid_redirect_uri", "Provide HTTPS redirect URIs; HTTP is allowed only for loopback development addresses.");
  }
  const clientId = "erikraft_" + randomId(24);
  const client = { client_id: clientId, client_name: String(body.client_name || "MCP client").slice(0, 120), redirect_uris: redirects, token_endpoint_auth_method: "none", created_at: new Date() };
  const { clients } = await oauthCollections();
  await clients.insertOne({ _id: clientId, ...client });
  return sendJson(res, 201, { client_id: clientId, client_name: client.client_name, redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] });
}
async function handleAuthorize(req, res) {
  if (req.method === "GET") {
    const p = req.query || {}, required = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method"];
    if (required.some(key => typeof p[key] !== "string" || !p[key]) || p.response_type !== "code" || p.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge) || p.state.length > 1024 || !validateRedirect(p.redirect_uri)) {
      return oauthError(res, 400, "invalid_request", "A valid authorization code request using PKCE S256 is required.");
    }
    const { clients } = await oauthCollections();
    const client = await clients.findOne({ _id: p.client_id }, { projection: { redirect_uris: 1, client_name: 1 } });
    if (!client || !client.redirect_uris.includes(p.redirect_uri)) return oauthError(res, 400, "invalid_client", "Unknown client or redirect URI.");
    if (p.resource && p.resource !== RESOURCE) return oauthError(res, 400, "invalid_target", "The requested resource is not supported.");
    return page(res, loginPage({ client_id: p.client_id, client_name: String(client.client_name || "Cliente MCP").slice(0, 120), redirect_uri: p.redirect_uri, response_type: "code", scope: "mcp:tools", state: p.state, code_challenge: p.code_challenge, code_challenge_method: "S256", resource: RESOURCE }));
  }
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request", "Use GET to start authorization.");
  const p = bodyOf(req), { clients, codes } = await oauthCollections();
  const client = await clients.findOne({ _id: String(p.client_id || "") }, { projection: { redirect_uris: 1 } });
  if (p.response_type !== "code" || p.code_challenge_method !== "S256" || typeof p.state !== "string" || p.state.length > 1024 || !/^[A-Za-z0-9_-]{43,128}$/.test(String(p.code_challenge || ""))) return oauthError(res, 400, "invalid_request", "Invalid authorization request.");
  if (!client || !client.redirect_uris.includes(p.redirect_uri) || !validateRedirect(p.redirect_uri)) return oauthError(res, 400, "invalid_client", "Unknown client or redirect URI.");
  let user;
  try { user = await getAuth(adminApp()).verifyIdToken(String(p.firebase_id_token || ""), true); }
  catch { return oauthError(res, 401, "login_required", "Sign in with a valid Firebase session."); }
  if (user.firebase?.sign_in_provider === "password" && user.email_verified !== true) return oauthError(res, 403, "access_denied", "Verify your email before connecting.");
  const code = randomId(32), expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await codes.insertOne({ _id: hash(code), client_id: p.client_id, redirect_uri: p.redirect_uri, resource: RESOURCE, code_challenge: p.code_challenge, firebase_id_token: String(p.firebase_id_token), uid: user.uid, expires_at: expiresAt });
  const redirect = new URL(p.redirect_uri); redirect.searchParams.set("code", code); redirect.searchParams.set("state", p.state);
  return sendJson(res, 200, { redirect: redirect.toString() });
}
async function handleToken(req, res) {
  if (req.method !== "POST") return oauthError(res, 405, "invalid_request", "Use POST.");
  const p = bodyOf(req), { codes, tokens } = await oauthCollections();
  if (p.grant_type !== "authorization_code" || typeof p.code !== "string" || typeof p.code_verifier !== "string" || p.code_verifier.length < 43 || p.code_verifier.length > 128) return oauthError(res, 400, "invalid_grant", "Authorization code and PKCE verifier are required.");
  if (typeof p.client_id !== "string" || typeof p.redirect_uri !== "string") return oauthError(res, 400, "invalid_request", "client_id and redirect_uri are required.");
  if (p.resource && p.resource !== RESOURCE) return oauthError(res, 400, "invalid_target", "The requested resource is not supported.");
  const calculated = createHash("sha256").update(p.code_verifier).digest("base64url");
  const result = await codes.findOneAndDelete({ _id: hash(p.code), client_id: p.client_id, redirect_uri: p.redirect_uri, resource: RESOURCE, code_challenge: calculated, expires_at: { $gt: new Date() } });
  const record = result && (result.value || result);
  if (!record) return oauthError(res, 400, "invalid_grant", "The code is invalid, expired, already used, or the PKCE verifier did not match.");
  let decoded;
  try { decoded = await getAuth(adminApp()).verifyIdToken(record.firebase_id_token, true); }
  catch { return oauthError(res, 400, "invalid_grant", "The Firebase session has expired. Authorize again."); }
  if (decoded.uid !== record.uid) return oauthError(res, 400, "invalid_grant", "The Firebase identity did not match.");
  const expiresIn = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  if (expiresIn < 1) return oauthError(res, 400, "invalid_grant", "The Firebase session has expired. Authorize again.");
  const accessToken = randomId(32);
  await tokens.insertOne({ _id: hash(accessToken), client_id: p.client_id, uid: decoded.uid, firebase_id_token: record.firebase_id_token, scope: "mcp:tools", expires_at: new Date(Date.now() + expiresIn * 1000) });
  return sendJson(res, 200, { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn, scope: "mcp:tools" });
}
export default async function handler(req, res) {
  noStore(res);
  const action = String(req.query?.action || "").toLowerCase();
  try {
    if (action === "authorization-server") {
      if (req.method !== "GET") return oauthError(res, 405, "invalid_request", "Use GET.");
      return sendJson(res, 200, { issuer: ORIGIN, authorization_endpoint: OAUTH_ROOT + "/authorize", token_endpoint: OAUTH_ROOT + "/token", registration_endpoint: OAUTH_ROOT + "/register", response_types_supported: ["code"], grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["mcp:tools"], client_id_metadata_document_supported: false });
    }
    if (action === "protected-resource") {
      if (req.method !== "GET") return oauthError(res, 405, "invalid_request", "Use GET.");
      return sendJson(res, 200, { resource: RESOURCE, authorization_servers: [ORIGIN], bearer_methods_supported: ["header"], scopes_supported: ["mcp:tools"] });
    }
    if (action === "register") return await handleRegistration(req, res);
    if (action === "authorize") return await handleAuthorize(req, res);
    if (action === "token") return await handleToken(req, res);
    return oauthError(res, 404, "not_found", "Unknown OAuth endpoint.");
  } catch (error) {
    console.error("[mcp-oauth]", error?.message || error);
    return oauthError(res, 503, "server_error", "OAuth is temporarily unavailable. Check Firebase Admin, MongoDB Atlas connectivity, and required environment variables.");
  }
}

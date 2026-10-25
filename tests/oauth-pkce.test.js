import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const oauth = readFileSync(new URL("../api/oauth/[action].js", import.meta.url), "utf8");
const mcp = readFileSync(new URL("../api/mcp.js", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("OAuth uses Firebase Authentication for identity and MongoDB Atlas for OAuth state", () => {
  assert.match(oauth, /firebase-admin\/auth/);
  assert.match(oauth, /MongoClient/);
  assert.match(oauth, /mcp_oauth_clients/);
  assert.match(oauth, /mcp_oauth_codes/);
  assert.doesNotMatch(oauth, /firebase-admin\/firestore|Firestore/);
  assert.match(oauth, /MONGODB_URI/);
});

test("OAuth requires Authorization Code with PKCE S256 and one-time expiring codes", () => {
  assert.match(oauth, /response_type !== "code"/);
  assert.match(oauth, /code_challenge_method !== "S256"/);
  assert.match(oauth, /createHash\("sha256"\)/);
  assert.match(oauth, /findOneAndDelete/);
  assert.match(oauth, /expireAfterSeconds: 0/);
  assert.match(oauth, /expires_in:/);
});

test("OAuth discovery metadata is routed through Vercel", () => {
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === "/.well-known/oauth-authorization-server"));
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === "/.well-known/oauth-protected-resource"));
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === "/.well-known/oauth-protected-resource/api/mcp"));
});

test("MCP endpoint requires a bearer token and no longer asks for a token tool argument", () => {
  assert.match(mcp, /WWW-Authenticate/);
  assert.match(mcp, /verifyBearer\(accessToken\)/);
  assert.doesNotMatch(mcp, /id="token"/);
  assert.doesNotMatch(mcp, /firebaseIdToken: \{ type: "string"/);
});

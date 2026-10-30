import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const serviceWorker = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
const registration = readFileSync(new URL("../assets/js/pwa-register.js", import.meta.url), "utf8");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("PWA cache uses the 2026-10-29 release key and removes previous app caches", () => {
  assert.match(serviceWorker, /const CACHE_NAME = "erikraft-ai-pwa-2026-10-29"/);
  assert.match(serviceWorker, /keys\.filter\(\(key\) => key\.startsWith\("erikraft-ai-pwa-"\) && key !== CACHE_NAME\)/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
});

test("service worker update checks bypass the browser HTTP cache", () => {
  assert.match(registration, /register\("\/service-worker\.js", \{ scope: "\/", updateViaCache: "none" \}\)/);
});

test("static assets require revalidation so clients can discover deployed updates", () => {
  const rule = vercel.headers.find((entry) => entry.source === "/assets/(.*)");
  assert.ok(rule, "assets header rule must exist");
  const cacheControl = rule.headers.find((header) => header.key.toLowerCase() === "cache-control");
  assert.equal(cacheControl?.value, "public, max-age=0, must-revalidate");
  const serviceWorkerRule = vercel.headers.find((entry) => entry.source === "/service-worker.js");
  assert.equal(
    serviceWorkerRule?.headers.find((header) => header.key.toLowerCase() === "cache-control")?.value,
    "public, max-age=0, must-revalidate"
  );
});

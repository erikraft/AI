import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request as httpsRequest } from "node:https";

const MCP_RPC_TIMEOUT_MS = 5000;
const BLOCKED_IP_RANGES = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
]) BLOCKED_IP_RANGES.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["::", 96],
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
]) BLOCKED_IP_RANGES.addSubnet(address, prefix, "ipv6");

function normalizeAddress(address) {
  let value = String(address || "").trim().toLowerCase().split("%")[0].replace(/^\[|\]$/g, "");
  if (!value.startsWith("::ffff:")) return value;
  const mapped = value.slice(7);
  if (isIP(mapped) === 4) return mapped;
  const halves = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (halves) {
    const high = Number.parseInt(halves[1], 16);
    const low = Number.parseInt(halves[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return value;
}

function privateIp(address) {
  const value = normalizeAddress(address);
  const ipType = isIP(value);
  if (!ipType) return true;
  return BLOCKED_IP_RANGES.check(value, ipType === 4 ? "ipv4" : "ipv6");
}

function parseMcpUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); }
  catch { throw new Error("Enter a valid MCP server URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href.length > 2048) {
    throw new Error("MCP servers must use a public HTTPS URL without embedded credentials or fragments.");
  }
  const hostname = normalizeAddress(url.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")
      || hostname.endsWith(".internal") || hostname.endsWith(".test") || hostname.endsWith(".invalid")) {
    throw new Error("Local and reserved hostnames are not allowed for MCP servers.");
  }
  return { url, hostname };
}

export async function resolveMcpTarget(value) {
  const { url, hostname } = parseMcpUrl(value);
  const ipType = isIP(hostname);
  if (ipType) {
    if (privateIp(hostname)) throw new Error("Private or reserved IP addresses are not allowed for MCP servers.");
    return { url, hostname, address: hostname, family: ipType };
  }
  let addresses;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("The MCP hostname could not be resolved."); }
  if (!addresses.length || addresses.some((entry) => privateIp(entry.address))) {
    throw new Error("The MCP hostname resolves to a private or reserved address.");
  }
  const selected = addresses[0];
  return { url, hostname, address: selected.address, family: isIP(selected.address) };
}

export async function validateMcpUrl(value) {
  return (await resolveMcpTarget(value)).url;
}

export function requestPinnedMcp(target, headers, body) {
  return new Promise((resolve, reject) => {
    const ipLookup = (_hostname, options, callback) => {
      if (typeof options === "function") {
        callback = options;
        options = {};
      }
      if (options?.all) return callback(null, [{ address: target.address, family: target.family }]);
      return callback(null, target.address, target.family);
    };
    const hostnameIsIp = isIP(target.hostname) !== 0;
    const request = httpsRequest(target.url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(MCP_RPC_TIMEOUT_MS),
      lookup: ipLookup,
      ...(hostnameIsIp ? {} : { servername: target.hostname })
    }, (response) => resolve(response));
    request.on("error", reject);
    request.end(body);
  });
}

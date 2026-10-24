const EXPECTED_PROJECT_ID = "erikraft-account";
const EXPECTED_SPACE_ID = "erikraft/erikraft-ai";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function featureEnabled(value) {
  if (value == null || String(value).trim() === "") return true;
  return ENABLED_VALUES.has(String(value).trim().toLowerCase());
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  let serviceAccount = null;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "");
  } catch {
    // Report booleans only; never return or log credential material.
  }

  const firebaseServiceAccountConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const firebaseServiceAccountJsonValid = Boolean(
    serviceAccount?.project_id && serviceAccount?.client_email && serviceAccount?.private_key
  );
  const firebaseProjectMatches = serviceAccount?.project_id === EXPECTED_PROJECT_ID;
  const hfSpaceId = String(process.env.HF_SPACE_ID || "").trim();
  const hfSpaceConfigured = Boolean(hfSpaceId);
  const hfSpaceIdValid = hfSpaceId.toLowerCase() === EXPECTED_SPACE_ID;
  const experimentalSecretConfigured = String(process.env.HF_SPACE_API_SECRET || "").trim().length >= 32;

  return res.status(200).json({
    ok: firebaseServiceAccountJsonValid && firebaseProjectMatches && hfSpaceIdValid,
    firebaseServiceAccountConfigured,
    firebaseServiceAccountJsonValid,
    firebaseProjectMatches,
    hfSpaceConfigured,
    hfSpaceIdValid,
    hfTokenConfigured: Boolean(process.env.HF_TOKEN),
    experimentalSecretConfigured,
    mcpEncryptionKeyConfigured: Boolean(String(process.env.MCP_ENCRYPTION_KEY || "").trim()),
    experimentalModels: {
      cosmosVideo: experimentalSecretConfigured && hfSpaceIdValid && featureEnabled(process.env.ENABLE_COSMOS_VIDEO),
      qwenText: experimentalSecretConfigured && hfSpaceIdValid && featureEnabled(process.env.ENABLE_QWEN_TEXT)
    },
    inferenceTested: false
  });
}

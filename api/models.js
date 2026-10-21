const truthy = (value) => ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  return res.status(200).json({
    models: {
      "DuoNeural/Cosmos3-Nano-Abliterated": truthy(process.env.ENABLE_COSMOS_VIDEO),
      "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF": truthy(process.env.ENABLE_QWEN_TEXT)
    }
  });
}

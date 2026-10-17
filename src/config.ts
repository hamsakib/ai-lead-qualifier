// Reads .env when present (Node 22+). Missing file is fine: real deployments
// set variables in the host's environment settings instead.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const config = {
  provider: (process.env.PROVIDER || "anthropic") as "anthropic" | "gemini" | "ollama",
  model: process.env.MODEL || "claude-opus-5-5",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:3b",
  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  hubspotToken: process.env.HUBSPOT_TOKEN || "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
  hotLeadScore: Number(process.env.HOT_LEAD_SCORE || 7),
  port: Number(process.env.PORT || 3000),
  dataFile: process.env.DATA_FILE || "data/leads.json",
};

// The model name to show in logs, /health and eval reports.
export function modelLabel(): string {
  if (config.provider === "gemini") return `gemini/${config.geminiModel}`;
  if (config.provider === "ollama") return `ollama/${config.ollamaModel}`;
  return config.model;
}

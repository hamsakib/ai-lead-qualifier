// Reads .env when present (Node 22+). Missing file is fine: real deployments
// set variables in the host's environment settings instead.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const config = {
  model: process.env.MODEL || "claude-opus-5-5",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  hubspotToken: process.env.HUBSPOT_TOKEN || "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
  hotLeadScore: Number(process.env.HOT_LEAD_SCORE || 7),
  port: Number(process.env.PORT || 3000),
  dataFile: process.env.DATA_FILE || "data/leads.json",
};

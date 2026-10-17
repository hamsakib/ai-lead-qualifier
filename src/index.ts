import { config } from "./config.ts";
import { createApp } from "./server.ts";
import { LeadStore } from "./store.ts";

if (!config.webhookSecret) {
  console.error("WEBHOOK_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = createApp(new LeadStore(config.dataFile));
app.listen(config.port, () => console.log(`Lead qualifier listening on http://localhost:${config.port}`));

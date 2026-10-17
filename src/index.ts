import { config, modelLabel } from "./config.ts";
import { processLead } from "./pipeline.ts";
import { createApp } from "./server.ts";
import { LeadStore } from "./store.ts";

if (!config.webhookSecret) {
  console.error("WEBHOOK_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const store = new LeadStore(config.dataFile);
const app = createApp(store);
app.listen(config.port, async () => {
  console.log(`Lead qualifier listening on http://localhost:${config.port} (model: ${modelLabel()})`);

  // Leads saved but never finished (server stopped mid-processing, or the model API was
  // down) are picked up again on start, one at a time. Saving first is what makes this possible.
  const unfinished = store.all().filter((r) => r.status === "received" || r.status === "error").reverse();
  if (unfinished.length) console.log(`Re-processing ${unfinished.length} unfinished lead(s)`);
  for (const record of unfinished) await processLead(record, store);
});

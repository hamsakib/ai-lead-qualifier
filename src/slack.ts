import { config } from "./config.ts";
import { HttpError, withRetry } from "./retry.ts";
import type { LeadInput, Qualification } from "./schemas.ts";

export async function alertHotLead(lead: LeadInput, q: Qualification): Promise<void> {
  const text = [
    `:fire: *Hot lead ${q.score}/10*: ${lead.name ?? lead.email}${lead.company ? ` (${lead.company})` : ""}`,
    `*Wants:* ${q.service}${q.budget_hint ? ` · *Budget:* ${q.budget_hint}` : ""} · *Urgency:* ${q.urgency}`,
    `*Summary:* ${q.summary}`,
    `*Email:* ${lead.email}${lead.phone ? ` · *Phone:* ${lead.phone}` : ""}`,
  ].join("\n");

  await withRetry(async () => {
    const res = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new HttpError(res.status, await res.text());
  });
}

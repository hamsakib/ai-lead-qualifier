import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { config, modelLabel } from "./config.ts";
import { processLead, receiveLead } from "./pipeline.ts";
import { LeadInput } from "./schemas.ts";
import { LeadStore } from "./store.ts";

export function secretMatches(given: string | undefined, expected: string): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Constant-time compare, so the secret can't be guessed one character at a time from response timing.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(store: LeadStore, process = processLead) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, model: modelLabel(), hubspot: Boolean(config.hubspotToken), slack: Boolean(config.slackWebhookUrl) });
  });

  app.post("/webhook/lead", (req: Request, res: Response) => {
    if (!secretMatches(req.header("x-webhook-secret"), config.webhookSecret)) {
      res.status(401).json({ error: "invalid or missing x-webhook-secret" });
      return;
    }
    const parsed = LeadInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid lead", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return;
    }

    const { record, duplicate } = receiveLead(parsed.data, store);
    // Answer fast (202 = accepted, processing later). Form tools and webhook senders time out
    // after a few seconds and resend, and the AI call can take longer than that.
    res.status(202).json({ id: record.id, duplicate });

    if (!duplicate) {
      // In production this goes on a job queue (e.g. QStash, BullMQ, SQS) so a restart can't drop it.
      void process(record, store);
    }
  });

  app.get("/leads", (req, res) => {
    if (!secretMatches(req.header("x-webhook-secret"), config.webhookSecret)) {
      res.status(401).json({ error: "invalid or missing x-webhook-secret" });
      return;
    }
    res.json(store.all());
  });

  return app;
}

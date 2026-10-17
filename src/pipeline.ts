import { config } from "./config.ts";
import { addNote, upsertContact } from "./hubspot.ts";
import { idempotencyKey, normalizeLead } from "./normalize.ts";
import { qualifyLead, type AskModel } from "./qualify.ts";
import type { LeadInput } from "./schemas.ts";
import { alertHotLead } from "./slack.ts";
import type { LeadRecord, LeadStore } from "./store.ts";

export interface Sinks {
  crm?: (lead: LeadInput, record: LeadRecord) => Promise<string>; // returns contact id
  alert?: (lead: LeadInput, record: LeadRecord) => Promise<void>;
}

// Real sinks are switched on by their env vars, so the service runs with none,
// either, or both configured.
export function defaultSinks(): Sinks {
  return {
    crm: config.hubspotToken
      ? async (lead, r) => {
          const id = await upsertContact(lead, r.qualification!);
          await addNote(id, lead, r.qualification!);
          return id;
        }
      : undefined,
    alert: config.slackWebhookUrl ? (lead, r) => alertHotLead(lead, r.qualification!) : undefined,
  };
}

// Step 1 of 2, run inside the HTTP request: validate, dedupe, save.
// The lead is on disk before any slow or flaky step runs, so it can't be lost.
export function receiveLead(raw: LeadInput, store: LeadStore): { record: LeadRecord; duplicate: boolean } {
  const lead = normalizeLead(raw);
  const id = idempotencyKey(lead);
  const existing = store.get(id);
  if (existing) return { record: existing, duplicate: true };
  const record: LeadRecord = { id, receivedAt: new Date().toISOString(), lead, status: "received" };
  store.save(record);
  return { record, duplicate: false };
}

// Step 2 of 2, run after the HTTP response: score with AI, then CRM and alert.
// Each step's outcome is recorded on the lead, and one failing step never blocks the others.
export async function processLead(record: LeadRecord, store: LeadStore, ask?: AskModel, sinks: Sinks = defaultSinks()) {
  try {
    const result = await qualifyLead(record.lead, ask);
    record.cost = { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ms: result.ms, attempts: result.attempts };
    record.status = result.status;
    record.problems = result.problems;
    if (result.qualification) record.qualification = result.qualification;
    store.save(record);
  } catch (err) {
    record.status = "error";
    record.error = err instanceof Error ? err.message : String(err);
    store.save(record);
    console.error(`[lead ${record.id}] scoring failed, kept for retry:`, record.error);
    return record;
  }

  const q = record.qualification;
  if (!q) return record; // needs_review: a person decides, nothing is pushed anywhere

  if (sinks.crm) {
    try {
      record.crm = { status: "synced", contactId: await sinks.crm(record.lead, record) };
    } catch (err) {
      record.crm = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    record.crm = { status: "skipped" };
  }

  if (sinks.alert && q.score >= config.hotLeadScore) {
    try {
      await sinks.alert(record.lead, record);
      record.alert = { status: "sent" };
    } catch (err) {
      record.alert = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  } else {
    record.alert = { status: "skipped" };
  }

  store.save(record);
  console.log(`[lead ${record.id}] ${record.status} score=${q.score} crm=${record.crm.status} alert=${record.alert.status} ${record.cost?.ms}ms`);
  return record;
}

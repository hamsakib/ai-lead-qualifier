import { config } from "./config.ts";
import { fetchJson, withRetry } from "./retry.ts";
import type { LeadInput, Qualification } from "./schemas.ts";

const API = "https://api.hubapi.com";

function headers() {
  return { Authorization: `Bearer ${config.hubspotToken}`, "Content-Type": "application/json" };
}

// Upsert by email: one call creates the contact or updates the existing one,
// so a returning lead never becomes a duplicate contact.
export async function upsertContact(lead: LeadInput, q: Qualification): Promise<string> {
  const [first, ...rest] = (lead.name ?? "").split(" ");
  const body = {
    inputs: [
      {
        idProperty: "email",
        id: lead.email,
        properties: {
          email: lead.email,
          firstname: first || undefined,
          lastname: rest.join(" ") || undefined,
          phone: lead.phone,
          company: lead.company,
          lifecyclestage: "lead",
          hs_lead_status: q.score >= 4 ? "NEW" : "UNQUALIFIED",
        },
      },
    ],
  };
  const res = (await withRetry(() =>
    fetchJson(`${API}/crm/v3/objects/contacts/batch/upsert`, { method: "POST", headers: headers(), body: JSON.stringify(body) }),
  )) as { results: { id: string }[] };
  return res.results[0].id;
}

// The AI's reasoning goes on the contact as a note, so sales sees why it scored what it did.
export async function addNote(contactId: string, lead: LeadInput, q: Qualification): Promise<void> {
  const html = [
    `<b>AI lead score: ${q.score}/10</b> (${q.intent}, urgency ${q.urgency})`,
    `Service: ${escapeHtml(q.service)}${q.budget_hint ? ` · Budget: ${escapeHtml(q.budget_hint)}` : ""}`,
    `Summary: ${escapeHtml(q.summary)}`,
    `Why: ${escapeHtml(q.reason)}`,
    `<br>Original message:<br>${escapeHtml(lead.message)}`,
    `<br>Suggested reply (review before sending):<br>${escapeHtml(q.suggested_reply)}`,
  ].join("<br>");
  const body = {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html },
    // 202 = HubSpot's built-in "note to contact" association.
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  };
  await withRetry(() => fetchJson(`${API}/crm/v3/objects/notes`, { method: "POST", headers: headers(), body: JSON.stringify(body) }));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

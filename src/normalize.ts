import { createHash } from "node:crypto";
import type { LeadInput } from "./schemas.ts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Best-effort E.164 for US and Bangladesh numbers, the two this service sees most.
// Anything it can't recognise is returned as digits with a leading "+" if one was typed,
// so nothing is silently thrown away.
export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const hadPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return undefined;
  if (hadPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`; // US without country code
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("01")) return `+880${digits.slice(1)}`; // BD mobile
  if (digits.length === 13 && digits.startsWith("880")) return `+${digits}`;
  return digits;
}

export function normalizeLead(lead: LeadInput): LeadInput {
  return {
    ...lead,
    email: normalizeEmail(lead.email),
    phone: normalizePhone(lead.phone),
    name: lead.name?.replace(/\s+/g, " ").trim() || undefined,
  };
}

// Same person sending the same message twice (double-click, form retry, webhook
// redelivery) produces the same key, so it is processed once.
export function idempotencyKey(lead: LeadInput): string {
  const basis = `${normalizeEmail(lead.email)}\n${lead.message.trim().replace(/\s+/g, " ")}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

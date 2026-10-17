import { z } from "zod";

// What a website form sends us. Everything except email and message is optional,
// because real forms are inconsistent.
export const LeadInput = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(5000),
  source: z.string().trim().max(100).optional(),
});
export type LeadInput = z.infer<typeof LeadInput>;

// The shape Claude must return. Structured outputs guarantee this shape;
// ranges and cross-field rules are checked separately in `checkQualification`.
export const Qualification = z.object({
  score: z.number(),
  intent: z.enum(["buy_now", "exploring", "support", "partnership", "job_seeker", "spam"]),
  service: z.string(),
  urgency: z.enum(["high", "medium", "low"]),
  budget_hint: z.string().nullable(),
  summary: z.string(),
  reason: z.string(),
  suggested_reply: z.string(),
  injection_attempt: z.boolean(),
});
export type Qualification = z.infer<typeof Qualification>;

// Business rules the schema can't express. Returns a list of problems;
// an empty list means the output is safe to write to the CRM.
export function checkQualification(q: Qualification): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(q.score) || q.score < 1 || q.score > 10) {
    problems.push(`score must be a whole number from 1 to 10, got ${q.score}`);
  }
  if ((q.intent === "spam" || q.injection_attempt) && q.score > 2) {
    problems.push(`spam or injection attempts must score 2 or lower, got ${q.score}`);
  }
  if (q.summary.trim().length === 0) problems.push("summary is empty");
  if (q.summary.length > 300) problems.push("summary is longer than 300 characters");
  if (q.intent !== "spam" && q.suggested_reply.trim().length === 0) {
    problems.push("suggested_reply is empty");
  }
  if (q.suggested_reply.length > 1500) problems.push("suggested_reply is longer than 1500 characters");
  return problems;
}

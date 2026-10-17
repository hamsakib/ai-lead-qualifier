import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LeadInput, Qualification } from "./schemas.ts";

export interface LeadRecord {
  id: string; // idempotency key
  receivedAt: string;
  lead: LeadInput;
  status: "received" | "qualified" | "needs_review" | "error";
  qualification?: Qualification;
  problems?: string[];
  crm?: { status: "synced" | "skipped" | "failed"; contactId?: string; error?: string };
  alert?: { status: "sent" | "skipped" | "failed"; error?: string };
  cost?: { model: string; inputTokens: number; outputTokens: number; ms: number; attempts: number };
  error?: string;
}

// A JSON file is enough for a demo and keeps the project dependency-free.
// In production this is a database table with a unique index on `id`.
export class LeadStore {
  private records = new Map<string, LeadRecord>();

  constructor(private readonly file: string) {
    try {
      for (const r of JSON.parse(readFileSync(file, "utf8")) as LeadRecord[]) this.records.set(r.id, r);
    } catch {
      // first run: no file yet
    }
  }

  get(id: string) {
    return this.records.get(id);
  }

  all() {
    return [...this.records.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  save(record: LeadRecord) {
    this.records.set(record.id, record);
    mkdirSync(dirname(this.file), { recursive: true });
    // Write then rename, so a crash mid-write never leaves a half-written file.
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.all(), null, 2));
    renameSync(tmp, this.file);
  }
}

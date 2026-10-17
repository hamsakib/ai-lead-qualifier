// Runs every lead in evals/leads.json through the real model and checks the score
// lands in the expected range. Run it after any change to the prompt or the model:
//   npm run eval
// It calls the API once or twice per lead, so it costs a few cents.
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "../src/config.ts";
import { qualifyLead, type QualifyResult } from "../src/qualify.ts";
import type { LeadInput } from "../src/schemas.ts";

interface Case {
  id: string;
  expect: { min: number; max: number };
  lead: LeadInput;
}

// $ per million tokens (input, output). Update when prices change.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

const cases: Case[] = JSON.parse(readFileSync(new URL("./leads.json", import.meta.url), "utf8"));

async function runAll(limit = 3) {
  const results: { c: Case; r?: QualifyResult; error?: string }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const c = cases[next++];
      try {
        results.push({ c, r: await qualifyLead(c.lead) });
      } catch (err) {
        results.push({ c, error: err instanceof Error ? err.message : String(err) });
      }
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: limit }, worker)); // a few at a time, not all at once
  process.stdout.write("\n");
  return cases.map((c) => results.find((x) => x.c.id === c.id)!);
}

const rows = await runAll();
let passed = 0;
let inTok = 0;
let outTok = 0;
const lines = ["| Case | Expected | Score | Intent | Injection | Attempts | ms | Result |", "|---|---|---|---|---|---|---|---|"];

for (const { c, r, error } of rows) {
  const q = r?.qualification;
  inTok += r?.inputTokens ?? 0;
  outTok += r?.outputTokens ?? 0;
  const ok = !!q && q.score >= c.expect.min && q.score <= c.expect.max;
  if (ok) passed++;
  const result = error ? `ERROR: ${error.slice(0, 60)}` : r!.status === "needs_review" ? "REVIEW" : ok ? "PASS" : "FAIL";
  lines.push(
    `| ${c.id} | ${c.expect.min}-${c.expect.max} | ${q?.score ?? "-"} | ${q?.intent ?? "-"} | ${q?.injection_attempt ?? "-"} | ${r?.attempts ?? "-"} | ${r?.ms ?? "-"} | ${result} |`,
  );
}

const [pin, pout] = PRICES[config.model] ?? [0, 0];
const cost = (inTok * pin + outTok * pout) / 1e6;
const summary = [
  `Model: ${config.model} · Run: ${new Date().toISOString()}`,
  `Passed: ${passed}/${rows.length} (${Math.round((passed / rows.length) * 100)}%)`,
  `Tokens: ${inTok} in / ${outTok} out · Cost: $${cost.toFixed(4)} total, $${(cost / rows.length).toFixed(5)} per lead`,
];

const report = [...summary, "", ...lines].join("\n");
console.log(report);
writeFileSync(new URL("./results.md", import.meta.url), `# Eval results\n\n${summary.join("  \n")}\n\n${lines.join("\n")}\n`);
console.log("\nSaved to evals/results.md");

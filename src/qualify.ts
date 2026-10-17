import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config, modelLabel } from "./config.ts";
import { leadMessage, SYSTEM_PROMPT } from "./prompt.ts";
import { askGemini, askOllama } from "./providers.ts";
import { checkQualification, Qualification, type LeadInput } from "./schemas.ts";

// What one model call returns, reduced to the fields this service uses.
// Keeping it this small lets tests pass in a fake model.
export interface ModelReply {
  parsed: Qualification | null;
  stopReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type AskModel = (messages: Anthropic.Beta.BetaMessageParam[]) => Promise<ModelReply>;

export interface QualifyResult {
  status: "qualified" | "needs_review";
  qualification: Qualification | null;
  problems: string[];
  attempts: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

let client: Anthropic | undefined;

// The real model call. The SDK already retries 429, 5xx and connection errors with
// exponential backoff; maxRetries raises that from the default 2 to 3.
export const askClaude: AskModel = async (messages) => {
  client ??= new Anthropic({ maxRetries: 3, timeout: 60_000 });
  const response = await client.beta.messages.parse({
    model: config.model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages,
    output_config: { format: betaZodOutputFormat(Qualification), effort: "low" },
    // If the model declines on a safety classifier, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  return {
    parsed: response.parsed_output ?? null,
    stopReason: response.stop_reason,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
};

// Which model answers, from PROVIDER in .env.
export function selectedModel(): AskModel {
  if (config.provider === "gemini") return askGemini;
  if (config.provider === "ollama") return askOllama;
  return askClaude;
}

// Scores one lead. Never throws for a bad model answer: it retries once with the
// problems spelled out, and if that also fails the lead is marked "needs_review"
// for a person. Network/API errors that survive the SDK's retries do throw, so the
// caller can keep the lead and try again later.
export async function qualifyLead(lead: LeadInput, ask: AskModel = selectedModel()): Promise<QualifyResult> {
  const started = Date.now();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: leadMessage(lead) }];
  let problems: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let model = modelLabel();
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    const reply = await ask(messages);
    inputTokens += reply.inputTokens;
    outputTokens += reply.outputTokens;
    model = reply.model;

    if (reply.stopReason === "refusal") {
      problems = ["model declined to score this lead"];
      break;
    }
    if (!reply.parsed) {
      problems = [`no valid JSON (stop_reason: ${reply.stopReason})`];
    } else {
      problems = checkQualification(reply.parsed);
      if (problems.length === 0) {
        return { status: "qualified", qualification: reply.parsed, problems, attempts: attempt, model, inputTokens, outputTokens, ms: Date.now() - started };
      }
    }

    // Second attempt: same lead, plus exactly what was wrong with the first answer.
    if (reply.parsed) messages.push({ role: "assistant", content: JSON.stringify(reply.parsed) });
    messages.push({
      role: "user",
      content: `Your previous answer broke these rules: ${problems.join("; ")}. Score the same lead again, following every rule.`,
    });
  }

  return { status: "needs_review", qualification: null, problems, attempts, model, inputTokens, outputTokens, ms: Date.now() - started };
}

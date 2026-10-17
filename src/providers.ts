// Free alternatives to the Claude API, behind the same AskModel interface as askClaude.
// Pick one with PROVIDER in .env:
//   anthropic  Claude API (paid, the default)
//   gemini     Google Gemini API free tier (free key from aistudio.google.com, no card)
//   ollama     a model running on this computer (free, no key, needs Ollama installed)
//
// Claude enforces the JSON schema on the API side. These two are asked for JSON and the
// schema is put in the prompt, so their answers lean harder on the Zod check and the
// retry in qualify.ts. That's the point of having the check: the pipeline stays safe
// whichever model sits behind it.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "./config.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";
import type { AskModel, ModelReply } from "./qualify.ts";
import { fetchJson, withRetry } from "./retry.ts";
import { Qualification } from "./schemas.ts";

const JSON_SCHEMA = z.toJSONSchema(Qualification);

const SYSTEM_WITH_SCHEMA = `${SYSTEM_PROMPT}

Reply with ONLY one JSON object, no other text, matching this JSON Schema:
${JSON.stringify(JSON_SCHEMA)}`;

type Turn = { role: "user" | "assistant"; text: string };

// qualify.ts only ever sends user and assistant turns; the system prompt is added here.
function toTurns(messages: Anthropic.Beta.BetaMessageParam[]): Turn[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    text: typeof m.content === "string" ? m.content : m.content.map((b) => ("text" in b ? b.text : "")).join(""),
  }));
}

// Models sometimes wrap JSON in ```json fences even when told not to.
function parseAnswer(text: string): Qualification | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const result = Qualification.safeParse(JSON.parse(cleaned));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const askGemini: AskModel = async (messages) => {
  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is not set");
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_WITH_SCHEMA }] },
    contents: toTurns(messages).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
  const res = (await withRetry(() =>
    fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiApiKey },
      body: JSON.stringify(body),
    }),
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    modelVersion?: string;
  };
  const candidate = res.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const finish = candidate?.finishReason ?? null;
  return {
    parsed: parseAnswer(text),
    stopReason: finish === "SAFETY" ? "refusal" : finish,
    model: res.modelVersion ?? config.geminiModel,
    inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
  } satisfies ModelReply;
};

export const askOllama: AskModel = async (messages) => {
  const body = {
    model: config.ollamaModel,
    messages: [
      { role: "system", content: SYSTEM_WITH_SCHEMA },
      ...toTurns(messages).map((t) => ({ role: t.role, content: t.text })),
    ],
    format: JSON_SCHEMA, // Ollama constrains the output to this schema
    stream: false,
    options: { temperature: 0 },
  };
  const res = (await withRetry(() =>
    fetchJson(`${config.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )) as { message?: { content?: string }; done_reason?: string; prompt_eval_count?: number; eval_count?: number; model?: string };
  return {
    parsed: parseAnswer(res.message?.content ?? ""),
    stopReason: res.done_reason ?? null,
    model: res.model ?? config.ollamaModel,
    inputTokens: res.prompt_eval_count ?? 0,
    outputTokens: res.eval_count ?? 0,
  } satisfies ModelReply;
};

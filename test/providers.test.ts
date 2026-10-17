import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { config } from "../src/config.ts";
import { askGemini, askOllama } from "../src/providers.ts";

const answer = {
  score: 8,
  intent: "buy_now",
  service: "HubSpot lead routing",
  urgency: "high",
  budget_hint: "$5k",
  summary: "Clinic wants web leads routed into HubSpot.",
  reason: "Clear need and budget.",
  suggested_reply: "Thanks for reaching out. - BrightPath Automation",
  injection_attempt: false,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Replaces fetch with one that records the request and returns a canned JSON body.
function stubFetch(body: unknown) {
  const seen: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return seen;
}

test("gemini: sends the lead and the schema, reads JSON (even inside ``` fences)", async () => {
  config.geminiApiKey = "test-key";
  const seen = stubFetch({
    candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(answer) + "\n```" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
    modelVersion: "gemini-test",
  });
  const r = await askGemini([{ role: "user", content: "<lead>hello</lead>" }]);
  assert.equal(r.parsed?.score, 8);
  assert.equal(r.inputTokens, 900);
  assert.equal(r.model, "gemini-test");

  const req = JSON.parse(String(seen[0].init.body));
  assert.match(seen[0].url, /generateContent$/);
  assert.equal((seen[0].init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  assert.equal(req.contents[0].parts[0].text, "<lead>hello</lead>");
  assert.match(req.systemInstruction.parts[0].text, /JSON Schema/);
  assert.equal(req.generationConfig.responseMimeType, "application/json");
});

test("gemini: an answer that breaks the schema comes back as parsed = null", async () => {
  config.geminiApiKey = "test-key";
  stubFetch({ candidates: [{ content: { parts: [{ text: '{"score":"high"}' }] }, finishReason: "STOP" }] });
  const r = await askGemini([{ role: "user", content: "x" }]);
  assert.equal(r.parsed, null);
});

test("gemini: a safety block is reported as a refusal", async () => {
  config.geminiApiKey = "test-key";
  stubFetch({ candidates: [{ finishReason: "SAFETY" }] });
  const r = await askGemini([{ role: "user", content: "x" }]);
  assert.equal(r.stopReason, "refusal");
});

test("gemini: missing key fails clearly instead of calling the API", async () => {
  config.geminiApiKey = "";
  await assert.rejects(askGemini([{ role: "user", content: "x" }]), /GEMINI_API_KEY is not set/);
});

test("ollama: sends the schema as `format` and reads the reply", async () => {
  const seen = stubFetch({ message: { content: JSON.stringify(answer) }, done_reason: "stop", prompt_eval_count: 800, eval_count: 90, model: "qwen2.5:3b" });
  const r = await askOllama([{ role: "user", content: "<lead>hi</lead>" }]);
  assert.equal(r.parsed?.intent, "buy_now");
  assert.equal(r.outputTokens, 90);
  const req = JSON.parse(String(seen[0].init.body));
  assert.equal(req.messages[0].role, "system");
  assert.equal(req.format.type, "object");
  assert.equal(req.stream, false);
});

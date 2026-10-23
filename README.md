# AI Lead Qualifier

A small webhook service that scores inbound sales leads with an LLM (Claude by default; Gemini's free tier or a local Ollama model also work), upserts them into HubSpot with the AI's reasoning as a note, and alerts Slack when a lead is hot.

Built for the most common small-business automation request: *"leads come in from our website, nobody follows up fast enough, and our CRM is a mess."*

## Main features

- Scores every lead with an LLM into structured JSON: score, intent, urgency, budget, summary, reason and a suggested reply
- Validates incoming leads with Zod and normalises email and phone
- Idempotent saves, so a repeated webhook never creates duplicate leads
- Business-rule check with one automatic retry, then a "needs review" state for a person
- Upserts the contact in HubSpot with the AI's reasoning as a note
- Sends a Slack alert when a lead scores 7 or higher

## Tech stack

Node.js · TypeScript · Express · Zod · Claude API (Anthropic SDK), with Gemini or Ollama as alternatives · HubSpot API · Slack webhooks

## Dependencies

- Runtime: `express`, `zod`, `@anthropic-ai/sdk`
- Development: `typescript`, `tsx`, `@types/express`, `@types/node`

## Links

- Repository: https://github.com/hamsakib/ai-lead-qualifier
- Author portfolio: https://hasan-al-mahmud-dev.vercel.app
- This is a back-end webhook service with no web UI; the Setup section below shows how to run it and send a test lead.

## How it works

```
Website form ──POST /webhook/lead──▶ check secret ─▶ validate (Zod) ─▶ normalise email/phone
                                                                              │
                                     202 Accepted ◀── save lead (idempotent) ◀┘
                                                          │  (after the response)
                                                          ▼
                                   Claude: structured JSON (score, intent, urgency,
                                   budget, summary, reason, suggested reply)
                                                          │
                                   business-rule check ── fail ─▶ retry once with the errors
                                                          │                 │
                                                          │            fail again
                                                          ▼                 ▼
                                             HubSpot: upsert contact   "needs_review"
                                             by email + add note       (a person decides)
                                                          │
                                             score ≥ 7 ─▶ Slack alert
```

Design choices:

- **The lead is saved before the AI runs.** If the model, HubSpot or Slack is down, the lead is still on disk with its error and can be retried. Nothing is lost.
- **The webhook answers in milliseconds (202).** Form tools and webhook senders time out after a few seconds and resend; the AI call can take longer.
- **Idempotent.** Same email + same message gives the same key, so a double-click or a redelivered webhook is processed once.
- **Structured outputs + code validation.** Claude returns JSON in a fixed schema (enforced by the API), then `checkQualification` enforces rules a schema can't express (whole-number score 1–10, spam must score ≤ 2, reply length). A bad answer is retried once with the exact problems listed; a second bad answer goes to a person, never to the CRM.
- **Prompt-injection resistant.** Lead text is passed as data inside `<lead>` tags, and the prompt tells the model never to follow instructions found there. Injection attempts are flagged (`injection_attempt: true`) and forced to score 1, and the business-rule check rejects any injection that still scores high.
- **Model-agnostic.** Every model sits behind one small `AskModel` function, so switching from Claude to Gemini or a local model is one line in `.env`. Claude enforces the JSON schema on the API side; for the others the schema goes in the prompt, and the same Zod check and retry keep bad answers out of the CRM. Run `npm run eval` on each to compare accuracy and cost.
- **Retries only what can succeed.** 429 and 5xx responses and network errors are retried with exponential backoff and jitter (and `Retry-After` when sent). 4xx errors fail at once so config problems aren't hidden.
- **One failing step doesn't block the others.** If HubSpot is down, the hot-lead Slack alert still goes out, and the CRM failure is recorded on the lead.

## Setup

```bash
npm install
cp .env.example .env      # then pick a PROVIDER and fill in its key, plus WEBHOOK_SECRET
npm test                  # 18 tests, no API key needed (fake model and stubbed HTTP)
npm run eval              # scores 15 test leads with the real model
npm run dev               # starts the server on http://localhost:3000
```

Send a test lead:

```bash
curl -X POST http://localhost:3000/webhook/lead \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <your WEBHOOK_SECRET>" \
  -d '{"name":"Karen Mills","email":"karen@clinic.com","company":"BrightSmile Dental","message":"We need web leads routed into HubSpot. Budget about $6k, start next month."}'
```

Then `GET /leads` (same header) shows the stored result.

| Variable | Required | What it does |
|---|---|---|
| `PROVIDER` | no | `anthropic` (default, paid), `gemini` (free tier, key from aistudio.google.com) or `ollama` (free, local model) |
| `ANTHROPIC_API_KEY` | for `anthropic` | Claude API key |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | for `gemini` | Free-tier key; model defaults to `gemini-3.5-flash-lite` |
| `OLLAMA_MODEL` / `OLLAMA_URL` | for `ollama` | Local model, default `qwen2.5:3b` at `http://localhost:11434` |
| `WEBHOOK_SECRET` | yes | Shared secret the form sends in `x-webhook-secret` |
| `MODEL` | no | Default `claude-opus-5-5`; `claude-haiku-5-5` is the low-cost option for high volume (run `npm run eval` to compare) |
| `HUBSPOT_TOKEN` | no | HubSpot private-app token (scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`). Without it, CRM sync is skipped |
| `SLACK_WEBHOOK_URL` | no | Slack incoming webhook. Without it, alerts are skipped |
| `HOT_LEAD_SCORE` | no | Alert threshold, default 7 |

## Evaluation

`evals/leads.json` holds 15 realistic leads with an expected score range: strong buyers, vague interest, a student, a job seeker, a support request, an SEO spam pitch, gibberish, a big budget for a service we don't sell, and two prompt-injection attempts (one direct, one hidden inside a real-looking request). `npm run eval` runs them all, prints pass/fail, tokens and cost per lead, and writes `evals/results.md`.

Run it after every prompt or model change. A change that improves one case but breaks two others shows up here before it reaches a customer.

## SOP (operating this service)

**Purpose.** Score every website lead within a minute, put it in HubSpot with the reasoning, and alert sales on hot ones.

**Trigger.** `POST /webhook/lead` from the website form (or Zapier/n8n/Make forwarding a form).

**Daily check (2 minutes).** `GET /leads` and look for `status: "needs_review"` or `"error"`, and for `crm.status: "failed"`.

| What you see | Meaning | What to do |
|---|---|---|
| `needs_review` | The AI gave two invalid answers, or declined | Read the lead and qualify it by hand. If it keeps happening for one kind of lead, add an example to `src/prompt.ts` and re-run the eval |
| `error` on scoring | The Claude API failed after its retries (outage, bad key, credit) | Check `ANTHROPIC_API_KEY` and account credit. The lead is saved; reprocess it once fixed |
| `crm.status: failed` with HTTP 401 | HubSpot token expired or lost a scope | Create a new private-app token, update `HUBSPOT_TOKEN` |
| `crm.status: failed` with HTTP 429/5xx | HubSpot rate limit or outage (already retried 4 times) | Usually clears by itself; reprocess later |
| `alert.status: failed` | Slack webhook revoked or wrong | Create a new incoming webhook, update `SLACK_WEBHOOK_URL` |
| 401 responses in the form tool | Form is sending the wrong `x-webhook-secret` | Match the form's header to `WEBHOOK_SECRET` |

**Changing how leads are scored.** Edit the rubric or examples in `src/prompt.ts`, run `npm run eval`, and only deploy if the pass rate didn't drop.

**Pausing it.** Remove or disable the form's webhook. Leads are not lost on the form side while it's paused, as long as the form stores submissions.

**Secrets.** Live only in `.env` locally and in the host's environment settings in production. Never in code or git.

## Production next steps

- Move processing from in-process to a job queue (QStash, BullMQ or SQS) so a restart can't drop a lead mid-processing.
- Swap the JSON file store for a database table with a unique index on the idempotency key.
- A small admin page for the `needs_review` queue with one-click approve and send of the suggested reply.
- HubSpot custom properties (`ai_score`, `ai_intent`) instead of only a note, so sales can filter and sort by score.

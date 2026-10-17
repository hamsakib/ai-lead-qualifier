# The same flow in n8n (no-code version)

Rebuilding the qualifier in n8n shows where no-code wins and where code wins. Takes about 30–45 minutes.

## Start n8n locally

```bash
npx n8n
```

Open http://localhost:5678 and create the local owner account (it stays on your machine).

## Build the workflow

1. **Webhook** node: method `POST`, path `lead`. Under *Authentication* choose *Header Auth*, header name `x-webhook-secret`, value = a secret of your choice. Set *Respond* to *Immediately* (same reason as the code version: answer fast, work after).
2. **Anthropic** node (n8n has a built-in Anthropic / "Message a model" node; or use an **HTTP Request** node to `https://api.anthropic.com/v1/messages` with headers `x-api-key` and `anthropic-version: 2023-06-01`). Paste the system prompt from `src/prompt.ts`, put the lead in `<lead>` tags in the user message, and ask for JSON only.
3. **Code** node (JavaScript): parse the JSON and check the same rules as `checkQualification` (score whole number 1–10, spam ≤ 2). Output a field `valid: true/false`.
4. **IF** node on `valid`:
   - false → **Google Sheets** "Append row" to a `needs_review` tab.
   - true → continue.
5. **HubSpot** node: *Contact → Create or Update* by email. Then *Engagement → Create* (note) with the score, summary and reason.
6. **IF** node on `score >= 7` → **Slack** node "Send message" to `#sales`.
7. In *Workflow settings*, set an **Error Workflow** that posts to Slack, so failures are noticed.

Test it with the same curl as the README, pointed at `http://localhost:5678/webhook-test/lead`.

## What the comparison shows

| | n8n | Code (this repo) |
|---|---|---|
| Time to first version | ~30 min | ~2 h |
| Who can change it | Non-developers, visually | A developer |
| Validation + retry-with-feedback | Possible but awkward (extra nodes, loops) | A few lines, unit-tested |
| Idempotency (no duplicate leads) | Needs an extra lookup step | Built in |
| Tests and eval set | Manual runs only | 13 tests + 15-case eval in CI |
| Cost at volume | Self-hosted: server only. Cloud: per execution | Server only |
| Best for | Simple flows the client's team will maintain | Flows where reliability and AI quality matter |

A common real-world answer is both: n8n (or Zapier/Make) for the plumbing the client can see and edit, calling a small service like this one for the AI step.

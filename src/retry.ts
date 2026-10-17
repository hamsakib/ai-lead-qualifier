// For calls to third-party APIs (HubSpot, Slack). Retries only failures that can
// succeed on a second try: rate limits (429), server errors (5xx) and network errors.
// A 400/401/403/404 is a bug or a config problem, so retrying would only hide it.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return err instanceof TypeError; // fetch network failure
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseMs = 500, maxWaitMs = 60_000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isRetryable(err)) throw err;
      const retryAfter = err instanceof HttpError ? err.retryAfterMs : undefined;
      // A server asking for a long wait (a daily quota resets in hours) means "not today":
      // give up now so the caller can keep the lead and retry later, instead of hanging.
      if (retryAfter !== undefined && retryAfter > maxWaitMs) throw err;
      // Exponential backoff with jitter: ~0.5s, 1s, 2s ... so many clients don't retry in lockstep.
      const backoff = baseMs * 2 ** (i - 1) * (0.5 + Math.random());
      await sleep(retryAfter ?? backoff);
    }
  }
}

export async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, text, retryAfterMs(res, text));
  }
  return text ? JSON.parse(text) : null;
}

// How long the server asked us to wait: the standard Retry-After header (seconds), or
// Google's "retryDelay": "12.5s" inside the error body, which Gemini sends instead.
function retryAfterMs(res: Response, body: string): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const match = body.match(/"retryDelay":\s*"([\d.]+)s"/);
  return match ? Math.ceil(Number(match[1]) * 1000) + 250 : undefined;
}

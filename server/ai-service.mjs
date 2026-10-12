import { createSlidingWindowRateLimiter } from "./rate-limit.mjs";

export const createAiService = ({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  rateLimit = Number(process.env.PALLETSCANNER_AI_RATE_LIMIT_PER_MINUTE ?? 10),
  timeoutMs = Number(process.env.PALLETSCANNER_AI_TIMEOUT_MS ?? 90_000),
  fetchImpl = fetch,
} = {}) => {
  const enforceRateLimit = createSlidingWindowRateLimiter({
    limit: rateLimit,
    message: "Too many AI requests. Wait a minute and try again.",
  });

  return async (userId, payload) => {
    enforceRateLimit(userId);
    if (!apiKey) {
      const error = new Error("Anthropic is not configured on the backend.");
      error.statusCode = 503;
      throw error;
    }
    if (!Array.isArray(payload?.messages) || payload.messages.length === 0) {
      const error = new Error("AI messages are required.");
      error.statusCode = 400;
      throw error;
    }
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(Math.max(Number(payload.max_tokens) || 1000, 1), 2000),
        messages: payload.messages,
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error(`Anthropic request failed (${response.status}): ${body.slice(0, 300)}`);
      error.statusCode = response.status;
      throw error;
    }
    return JSON.parse(body);
  };
};

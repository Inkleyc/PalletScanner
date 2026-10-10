export const createAiService = ({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  rateLimit = Number(process.env.PALLETSCANNER_AI_RATE_LIMIT_PER_MINUTE ?? 10),
} = {}) => {
  const requestTimesByUser = new Map();
  const enforceRateLimit = (userId) => {
    const windowStart = Date.now() - 60_000;
    const recent = (requestTimesByUser.get(userId) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );
    if (recent.length >= rateLimit) {
      const error = new Error("Too many AI requests. Wait a minute and try again.");
      error.statusCode = 429;
      throw error;
    }
    recent.push(Date.now());
    requestTimesByUser.set(userId, recent);
  };

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
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
